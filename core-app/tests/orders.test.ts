import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, get } from './helpers.ts';

test('orders: returns an order view in integer paise', async () => {
  const app = createTestApp();
  const response = await get(app, '/api/orders/ord_1001');
  assert.equal(response.status, 200);
  const { order } = response.body as { order: Record<string, unknown> };
  assert.equal(order.amount, 50_000);
  assert.equal(order.refundedAmount, 0);
  assert.equal(order.refundableAmount, 0, 'unpaid orders have nothing to refund');
  assert.equal(order.currency, 'INR');
});

test('orders: unknown order uses the standard error envelope', async () => {
  const app = createTestApp();
  const response = await get(app, '/api/orders/ord_missing');
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    error: { code: 'ORDER_NOT_FOUND', message: 'Order ord_missing was not found', details: { orderId: 'ord_missing' } },
  });
});

test('router: unknown routes return ROUTE_NOT_FOUND', async () => {
  const app = createTestApp();
  const response = await get(app, '/api/nope');
  assert.equal(response.status, 404);
  assert.equal((response.body as { error: { code: string } }).error.code, 'ROUTE_NOT_FOUND');
});
