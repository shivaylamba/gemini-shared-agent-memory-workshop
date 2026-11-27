import { AppError } from '../utils/errors.ts';
import type { Order } from './order.ts';

/** In-memory order storage. Returns copies so callers cannot mutate stored state by accident. */
export class OrderRepository {
  private readonly orders = new Map<string, Order>();

  constructor(seed: Order[] = []) {
    for (const order of seed) this.orders.set(order.id, { ...order });
  }

  find(id: string): Order | undefined {
    const order = this.orders.get(id);
    return order ? { ...order } : undefined;
  }

  /** Returns the order or throws ORDER_NOT_FOUND. */
  get(id: string): Order {
    const order = this.find(id);
    if (!order) throw new AppError('ORDER_NOT_FOUND', `Order ${id} was not found`, { orderId: id });
    return order;
  }

  save(order: Order): Order {
    this.orders.set(order.id, { ...order });
    return { ...order };
  }

  all(): Order[] {
    return [...this.orders.values()].map((order) => ({ ...order }));
  }
}
