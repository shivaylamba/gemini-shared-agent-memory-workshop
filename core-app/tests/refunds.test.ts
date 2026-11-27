import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, get, payOrder, post } from './helpers.ts';

// Visible acceptance tests for the refund endpoint. They fail until the
// refund operation is implemented. (A larger hidden grader is used for scoring.)

test('refunds: partially refunds a paid order', async () => {
  const app = createTestApp();
  await payOrder(app, 'ord_1001');
  const response = await post(app, '/api/orders/ord_1001/refund', { amount: 15_000, idempotencyKey: 'refund-request-001' });
  assert.equal(response.status, 201);
  const body = response.body as { refund: { amount: number; status: string }; order: { status: string; refundedAmount: number } };
  assert.equal(body.refund.amount, 15_000);
  assert.equal(body.refund.status, 'succeeded');
  assert.equal(body.order.status, 'partially_refunded');
  assert.equal(body.order.refundedAmount, 15_000);

  const order = await get(app, '/api/orders/ord_1001');
  assert.equal((order.body as { order: { refundableAmount: number } }).order.refundableAmount, 35_000);
});

test('refunds: unknown orders return ORDER_NOT_FOUND', async () => {
  const app = createTestApp();
  const response = await post(app, '/api/orders/ord_missing/refund', { amount: 100, idempotencyKey: 'refund-request-404' });
  assert.equal(response.status, 404);
  assert.equal((response.body as { error: { code: string } }).error.code, 'ORDER_NOT_FOUND');
});

test('refunds: rejects non-integer amounts', async () => {
  const app = createTestApp();
  await payOrder(app, 'ord_1002');
  const response = await post(app, '/api/orders/ord_1002/refund', { amount: 150.5, idempotencyKey: 'refund-request-400' });
  assert.equal(response.status, 400);
  assert.equal((response.body as { error: { code: string } }).error.code, 'VALIDATION_FAILED');
});
