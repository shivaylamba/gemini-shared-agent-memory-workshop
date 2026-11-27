import { createHash } from 'node:crypto';
import { AppError, validationError } from './errors.ts';

/**
 * ADR-003: state-changing requests carry a client-supplied idempotency key.
 *
 * - The same key with the same request returns the original result without
 *   repeating side effects (no second provider call).
 * - The same key with a different request fails with IDEMPOTENCY_KEY_REUSED.
 * - Only successful outcomes are stored. If the operation throws, the key is
 *   released so the client can retry with the same key.
 * - Keys are scoped (for example `payment:<orderId>`), so one key can be used
 *   for different operations without colliding.
 */

interface StoredOutcome {
  fingerprint: string;
  result: unknown;
}

interface InFlight {
  fingerprint: string;
  promise: Promise<unknown>;
}

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !KEY_PATTERN.test(value)) {
    throw validationError('idempotencyKey must be 8-128 characters of letters, digits, ".", "_", ":" or "-"', {
      field: 'idempotencyKey',
    });
  }
  return value;
}

/** Stable fingerprint of a request payload (key order does not matter). */
export function fingerprintOf(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export class IdempotencyStore {
  private readonly outcomes = new Map<string, StoredOutcome>();
  private readonly inFlight = new Map<string, InFlight>();

  /**
   * Runs `operation` at most once per (scope, key) for a given request
   * fingerprint and returns the stored result on replays.
   */
  async run<T>(scope: string, key: string, fingerprint: string, operation: () => Promise<T>): Promise<T> {
    const id = `${scope}::${key}`;

    const stored = this.outcomes.get(id);
    if (stored) {
      this.assertSameRequest(stored.fingerprint, fingerprint, key);
      return stored.result as T;
    }

    const pending = this.inFlight.get(id);
    if (pending) {
      this.assertSameRequest(pending.fingerprint, fingerprint, key);
      return pending.promise as Promise<T>;
    }

    const promise = (async () => {
      try {
        const result = await operation();
        this.outcomes.set(id, { fingerprint, result });
        return result;
      } finally {
        this.inFlight.delete(id);
      }
    })();
    this.inFlight.set(id, { fingerprint, promise });
    return promise;
  }

  private assertSameRequest(expected: string, actual: string, key: string): void {
    if (expected !== actual) {
      throw new AppError('IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used with a different request', {
        idempotencyKey: key,
      });
    }
  }
}
