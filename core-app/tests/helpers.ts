import { createApp, type ShopFlowApp } from '../src/app.ts';
import { seedOrders } from '../fixtures/orders.ts';

export function createTestApp(): ShopFlowApp {
  return createApp({ seed: seedOrders(), clock: () => new Date('2026-12-09T08:00:00.000Z') });
}

export async function post(app: ShopFlowApp, path: string, body: unknown) {
  return app.handle({ method: 'POST', path, body });
}

export async function get(app: ShopFlowApp, path: string) {
  return app.handle({ method: 'GET', path });
}

/** Pays a seeded order through the public API so it can be refunded. */
export async function payOrder(app: ShopFlowApp, orderId: string): Promise<void> {
  const response = await post(app, `/api/orders/${orderId}/pay`, { idempotencyKey: `pay-${orderId}-0001` });
  if (response.status !== 201) throw new Error(`Paying ${orderId} failed: ${JSON.stringify(response.body)}`);
}
