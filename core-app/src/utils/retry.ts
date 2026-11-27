export interface RetryOptions {
  /** Total attempts including the first one. */
  attempts: number;
  /** Decides whether a failure is worth retrying. */
  isRetryable: (error: unknown) => boolean;
  /** Delay before attempt n (1-based retry number). Defaults to no delay. */
  delayMs?: (retryNumber: number) => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retries an operation on retryable errors. Provider calls must be retried with
 * the SAME idempotency key so that a retry can never create a duplicate charge
 * or refund (see ADR-003 and runbooks/payment-incidents.md).
 */
export async function withRetry<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === options.attempts || !options.isRetryable(error)) throw error;
      const delay = options.delayMs?.(attempt) ?? 0;
      if (delay > 0) await sleep(delay);
    }
  }
  throw lastError;
}
