import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, get, post } from './helpers.ts';

test('payments: charges an order through PayGate v2 in paise', async () => {
  const app = createTestApp();
  const response = await post(app, '/api/orders/ord_1001/pay', { idempotencyKey: 'pay-ord_1001-0001' });
  assert.equal(response.status, 201);
  const body = response.body as { order: { status: string; refundableAmount: number } };
  assert.equal(body.order.status, 'paid');
  assert.equal(body.order.refundableAmount, 50_000);
  const charges = app.gateway.callsTo('createCharge');
  assert.equal(charges.length, 1);
  assert.equal(charges[0]!.api, 'v2');
  assert.equal(charges[0]!.payload.amount_paise, 50_000);
});

test('payments: replaying an idempotency key does not charge twice', async () => {
  const app = createTestApp();
  const first = await post(app, '/api/orders/ord_1002/pay', { idempotencyKey: 'pay-ord_1002-0001' });
  const second = await post(app, '/api/orders/ord_1002/pay', { idempotencyKey: 'pay-ord_1002-0001' });
  assert.equal(first.status, 201);
  assert.deepEqual(second, first);
  assert.equal(app.gateway.callsTo('createCharge').length, 1);
});

test('payments: retryable provider failures are retried with the same key', async () => {
  const app = createTestApp();
  app.gateway.failNext('createCharge', { code: 'GATEWAY_TIMEOUT', retryable: true });
  const response = await post(app, '/api/orders/ord_1003/pay', { idempotencyKey: 'pay-ord_1003-0001' });
  assert.equal(response.status, 201);
  const keys = app.gateway.callsTo('createCharge').map((call) => call.payload.idempotency_key);
  assert.deepEqual(keys, ['pay-ord_1003-0001', 'pay-ord_1003-0001']);
});

test('payments: declined charges return PAYMENT_PROVIDER_ERROR and leave the order pending', async () => {
  const app = createTestApp();
  app.gateway.failNext('createCharge', { code: 'CARD_DECLINED', retryable: false });
  const response = await post(app, '/api/orders/ord_1004/pay', { idempotencyKey: 'pay-ord_1004-0001' });
  assert.equal(response.status, 502);
  assert.equal((response.body as { error: { code: string } }).error.code, 'PAYMENT_PROVIDER_ERROR');
  const order = await get(app, '/api/orders/ord_1004');
  assert.equal((order.body as { order: { status: string } }).order.status, 'pending');
});

test('payments: rejects malformed idempotency keys', async () => {
  const app = createTestApp();
  const response = await post(app, '/api/orders/ord_1001/pay', { idempotencyKey: 'x' });
  assert.equal(response.status, 400);
  assert.equal((response.body as { error: { code: string } }).error.code, 'VALIDATION_FAILED');
});
