import type { Router } from '../utils/router.ts';
import type { OrderRepository } from './order-repository.ts';
import { toOrderView } from './order.ts';

export interface OrderRouteDeps {
  orders: OrderRepository;
}

export function registerOrderRoutes(router: Router, deps: OrderRouteDeps): void {
  router.get('/api/orders/:orderId', async (request) => {
    const order = deps.orders.get(request.params.orderId!);
    return { status: 200, body: { order: toOrderView(order) } };
  });
}
