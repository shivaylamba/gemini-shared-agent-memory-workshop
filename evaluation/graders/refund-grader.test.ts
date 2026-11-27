/**
 * HIDDEN GRADER — never copied into an agent workspace.
 *
 * Runs against a grading copy of a workspace (SHOPFLOW_WORKSPACE) inside a
 * Node permission-model sandbox. Each test name starts with a stable check id
 * in square brackets; evaluation/grading.ts maps results back to those ids.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspace = process.env.SHOPFLOW_WORKSPACE;
if (!workspace) throw new Error('SHOPFLOW_WORKSPACE is not set');

const appModule = await import(pathToFileURL(join(workspace, 'src', 'app.ts')).href);
const createApp = appModule.createApp as (options: Record<string, unknown>) => App;

interface Response { status: number; body: any }
interface GatewayCall { api: string; operation: string; payload: Record<string, unknown> }
interface App {
  handle(request: { method: string; path: string; body?: unknown }): Promise<Response>;
  gateway: {
    calls: GatewayCall[];
    callsTo(operation: string): GatewayCall[];
    failNext(operation: string, failure: { code: string; retryable: boolean }, times?: number): void;
  };
}

const T0 = '2026-12-01T10:00:00.000Z';
const order = (id: string, amount: number) => ({
  id, customerId: `cus_${id}`, status: 'pending', amount, refundedAmount: 0, createdAt: T0, updatedAt: T0,
});

function newApp(): App {
  return createApp({
    seed: [order('ord_g1', 50_000), order('ord_g2', 50_000), order('ord_g3', 70_000), order('ord_g4', 12_345)],
    clock: () => new Date('2026-12-09T09:30:00.000Z'),
  });
}

async function paid(app: App, orderId: string): Promise<void> {
  const response = await app.handle({ method: 'POST', path: `/api/orders/${orderId}/pay`, body: { idempotencyKey: `grader-pay-${orderId}` } });
  assert.equal(response.status, 201, `setup: paying ${orderId} failed (${JSON.stringify(response.body)})`);
}

const refund = (app: App, orderId: string, amount: unknown, idempotencyKey: unknown = `grader-refund-${orderId}-${String(amount)}`) =>
  app.handle({ method: 'POST', path: `/api/orders/${orderId}/refund`, body: { amount, idempotencyKey } });

const view = async (app: App, orderId: string) => (await app.handle({ method: 'GET', path: `/api/orders/${orderId}` })).body.order;

const refundCalls = (app: App) => app.gateway.calls.filter((call) => call.operation === 'createRefund' || call.operation === 'refund');

function assertEnvelope(response: Response, status: number, code: string): void {
  assert.equal(response.status, status, `expected HTTP ${status}, got ${response.status}: ${JSON.stringify(response.body)}`);
  assert.equal(typeof response.body, 'object');
  assert.deepEqual(Object.keys(response.body), ['error'], 'error responses must only contain the "error" envelope');
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.message, 'string');
  const allowed = new Set(['code', 'message', 'details']);
  for (const key of Object.keys(response.body.error)) assert.ok(allowed.has(key), `unexpected error field "${key}"`);
}

test('[full-refund] refunds the whole amount and marks the order refunded', async () => {
  const app = newApp();
  await paid(app, 'ord_g1');
  const response = await refund(app, 'ord_g1', 50_000);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(response.body.refund.amount, 50_000);
  assert.equal(response.body.refund.status, 'succeeded');
  const order = await view(app, 'ord_g1');
  assert.equal(order.status, 'refunded');
  assert.equal(order.refundedAmount, 50_000);
  assert.equal(order.refundableAmount, 0);
});

test('[partial-refund] refunds part of the amount and keeps the remainder refundable', async () => {
  const app = newApp();
  await paid(app, 'ord_g1');
  const response = await refund(app, 'ord_g1', 15_000, 'refund-request-001');
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const order = await view(app, 'ord_g1');
  assert.equal(order.status, 'partially_refunded');
  assert.equal(order.refundedAmount, 15_000);
  assert.equal(order.refundableAmount, 35_000);
});

test('[invalid-amount] rejects non-integer, non-positive and non-numeric amounts without calling the provider', async () => {
  const app = newApp();
  await paid(app, 'ord_g1');
  for (const amount of [150.5, 0, -100, '15000', null]) {
    const response = await refund(app, 'ord_g1', amount, `grader-invalid-${String(amount)}-key`);
    assert.equal(response.status, 400, `amount ${JSON.stringify(amount)} should be rejected, got ${response.status}`);
    assert.equal(response.body?.error?.code, 'VALIDATION_FAILED');
  }
  assert.equal(refundCalls(app).length, 0, 'provider must not be called for invalid amounts');
});

test('[excessive-amount] rejects refunds larger than the refundable amount', async () => {
  const app = newApp();
  await paid(app, 'ord_g2');
  const response = await refund(app, 'ord_g2', 50_001);
  assert.equal(response.status, 422, JSON.stringify(response.body));
  assert.equal(response.body?.error?.code, 'REFUND_EXCEEDS_REFUNDABLE');
  assert.equal(refundCalls(app).length, 0, 'provider must not be called when the amount is too large');
  assert.equal((await view(app, 'ord_g2')).refundedAmount, 0);
});

test('[unknown-order] returns ORDER_NOT_FOUND for unknown orders', async () => {
  const app = newApp();
  const response = await refund(app, 'ord_does_not_exist', 1_000);
  assert.equal(response.status, 404, JSON.stringify(response.body));
  assert.equal(response.body?.error?.code, 'ORDER_NOT_FOUND');
});

test('[idempotent-retry] replaying the same request returns the original refund without a second provider call', async () => {
  const app = newApp();
  await paid(app, 'ord_g1');
  const first = await refund(app, 'ord_g1', 20_000, 'grader-idem-key-0001');
  const second = await refund(app, 'ord_g1', 20_000, 'grader-idem-key-0001');
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(second.status, first.status);
  assert.deepEqual(second.body.refund, first.body.refund);
  assert.equal(refundCalls(app).length, 1, 'exactly one provider refund call expected');
  assert.equal((await view(app, 'ord_g1')).refundedAmount, 20_000);
});

test('[cumulative-accounting] tracks refunds cumulatively across requests', async () => {
  const app = newApp();
  await paid(app, 'ord_g3');
  assert.equal((await refund(app, 'ord_g3', 30_000, 'grader-cum-key-0001')).status, 201);
  assert.equal((await refund(app, 'ord_g3', 30_000, 'grader-cum-key-0002')).status, 201);
  const tooMuch = await refund(app, 'ord_g3', 10_001, 'grader-cum-key-0003');
  assert.equal(tooMuch.status, 422, 'only 10,000 paise should remain refundable');
  assert.equal(tooMuch.body?.error?.code, 'REFUND_EXCEEDS_REFUNDABLE');
  const rest = await refund(app, 'ord_g3', 10_000, 'grader-cum-key-0004');
  assert.equal(rest.status, 201, JSON.stringify(rest.body));
  const order = await view(app, 'ord_g3');
  assert.equal(order.refundedAmount, 70_000);
  assert.equal(order.status, 'refunded');
  const callsBefore = refundCalls(app).length;
  const again = await refund(app, 'ord_g3', 1, 'grader-cum-key-0005');
  // ADR-005 allows two readings for a fully refunded order: nothing remains (422
  // REFUND_EXCEEDS_REFUNDABLE), or the status is no longer refundable (409
  // ORDER_NOT_REFUNDABLE). Either is accepted; what matters is that it is refused
  // with the matching code, the provider is not called, and nothing changes.
  const accepted: Record<number, string> = { 422: 'REFUND_EXCEEDS_REFUNDABLE', 409: 'ORDER_NOT_REFUNDABLE' };
  assert.ok(again.status in accepted, `a fully refunded order has nothing left to refund (got ${again.status})`);
  assert.equal(again.body?.error?.code, accepted[again.status]);
  assert.equal(refundCalls(app).length, callsBefore, 'no provider call for a fully refunded order');
  const after = await view(app, 'ord_g3');
  assert.equal(after.refundedAmount, 70_000);
  assert.equal(after.status, 'refunded');
});

test('[current-adapter] refunds go through PayGate v2 in integer paise, never the legacy v1 API', async () => {
  const app = newApp();
  await paid(app, 'ord_g4');
  const response = await refund(app, 'ord_g4', 12_345);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const calls = refundCalls(app);
  assert.equal(calls.filter((call) => call.api === 'v1').length, 0, 'legacy PayGate v1 must not be used');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.operation, 'createRefund');
  assert.equal(calls[0]!.payload.amount_paise, 12_345);
  assert.equal(typeof calls[0]!.payload.idempotency_key, 'string', 'the idempotency key must be forwarded to the provider');
});

test('[standardized-errors] every refund error uses the standard envelope and catalogue codes', async () => {
  const app = newApp();
  await paid(app, 'ord_g1');
  assertEnvelope(await refund(app, 'ord_g1', 1.5, 'grader-std-key-0001'), 400, 'VALIDATION_FAILED');
  assertEnvelope(await refund(app, 'ord_nope', 100, 'grader-std-key-0002'), 404, 'ORDER_NOT_FOUND');
  assertEnvelope(await refund(app, 'ord_g2', 100, 'grader-std-key-0003'), 409, 'ORDER_NOT_REFUNDABLE');
  assertEnvelope(await refund(app, 'ord_g1', 999_999, 'grader-std-key-0004'), 422, 'REFUND_EXCEEDS_REFUNDABLE');
  assert.equal((await refund(app, 'ord_g1', 1_000, 'grader-std-key-0005')).status, 201);
  assertEnvelope(await refund(app, 'ord_g1', 2_000, 'grader-std-key-0005'), 409, 'IDEMPOTENCY_KEY_REUSED');
  const malformed = await app.handle({ method: 'POST', path: '/api/orders/ord_g1/refund', body: { amount: 100 } });
  assertEnvelope(malformed, 400, 'VALIDATION_FAILED');
});

test('[provider-failure] provider failures return PAYMENT_PROVIDER_ERROR, change nothing, and can be retried', async () => {
  const app = newApp();
  await paid(app, 'ord_g1');
  app.gateway.failNext('createRefund', { code: 'BANK_DECLINED', retryable: false });
  const failed = await refund(app, 'ord_g1', 5_000, 'grader-fail-key-0001');
  assertEnvelope(failed, 502, 'PAYMENT_PROVIDER_ERROR');
  let order = await view(app, 'ord_g1');
  assert.equal(order.refundedAmount, 0, 'a failed refund must not be counted');
  assert.equal(order.status, 'paid');

  const retried = await refund(app, 'ord_g1', 5_000, 'grader-fail-key-0001');
  assert.equal(retried.status, 201, `retrying with the same key after a failure should succeed: ${JSON.stringify(retried.body)}`);
  order = await view(app, 'ord_g1');
  assert.equal(order.refundedAmount, 5_000);

  app.gateway.failNext('createRefund', { code: 'GATEWAY_TIMEOUT', retryable: true });
  const flaky = await refund(app, 'ord_g1', 1_000, 'grader-fail-key-0002');
  assert.equal(flaky.status, 201, `a single retryable timeout should be retried: ${JSON.stringify(flaky.body)}`);
  assert.equal((await view(app, 'ord_g1')).refundedAmount, 6_000);
});
