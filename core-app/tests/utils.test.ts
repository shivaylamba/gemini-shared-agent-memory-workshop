import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatInr, parsePositivePaise } from '../src/utils/money.ts';
import { fingerprintOf, IdempotencyStore } from '../src/utils/idempotency.ts';
import { AppError } from '../src/utils/errors.ts';
import { withRetry } from '../src/utils/retry.ts';

test('money: accepts positive integer paise only', () => {
  assert.equal(parsePositivePaise(15_000), 15_000);
  for (const bad of [0, -1, 150.5, '15000', Number.NaN, undefined]) {
    assert.throws(() => parsePositivePaise(bad), (error: unknown) => error instanceof AppError && error.code === 'VALIDATION_FAILED');
  }
  assert.equal(formatInr(1_234_567), '₹12,345.67');
});

test('idempotency: stores successes, rejects reuse with a different request, releases failures', async () => {
  const store = new IdempotencyStore();
  let calls = 0;
  const op = async () => ++calls;
  assert.equal(await store.run('s', 'key-00000001', fingerprintOf({ a: 1 }), op), 1);
  assert.equal(await store.run('s', 'key-00000001', fingerprintOf({ a: 1 }), op), 1);
  assert.equal(calls, 1);
  await assert.rejects(store.run('s', 'key-00000001', fingerprintOf({ a: 2 }), op), (error: unknown) =>
    error instanceof AppError && error.code === 'IDEMPOTENCY_KEY_REUSED');

  await assert.rejects(store.run('s', 'key-00000002', 'f', async () => { throw new Error('boom'); }));
  assert.equal(await store.run('s', 'key-00000002', 'f', async () => 'ok'), 'ok');
});

test('retry: retries only retryable errors', async () => {
  let attempts = 0;
  const result = await withRetry(async () => {
    attempts++;
    if (attempts < 3) throw new Error('flaky');
    return 'done';
  }, { attempts: 3, isRetryable: () => true });
  assert.equal(result, 'done');
  await assert.rejects(withRetry(async () => { throw new Error('fatal'); }, { attempts: 3, isRetryable: () => false }));
});
