import { seedOrders } from '../fixtures/orders.ts';
import { createPaymentProvider } from './integrations/index.ts';
import { MockPayGate } from './integrations/mock-paygate.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { OrderRepository } from './orders/order-repository.ts';
import type { Order } from './orders/order.ts';
import { registerOrderRoutes } from './orders/order-routes.ts';
import { registerPaymentRoutes } from './payments/payment-routes.ts';
import { PaymentService } from './payments/payment-service.ts';
import { TransactionLedger } from './payments/transaction-ledger.ts';
import { registerRefundRoutes } from './refunds/refund-routes.ts';
import { RefundService } from './refunds/refund-service.ts';
import { IdempotencyStore } from './utils/idempotency.ts';
import { Router, type HttpRequest, type HttpResponse } from './utils/router.ts';

export interface AppOptions {
  gateway?: MockPayGate;
  seed?: Order[];
  clock?: () => Date;
}

export interface ShopFlowApp {
  handle(request: HttpRequest): Promise<HttpResponse>;
  gateway: MockPayGate;
  orders: OrderRepository;
  ledger: TransactionLedger;
}

export function createApp(options: AppOptions = {}): ShopFlowApp {
  const gateway = options.gateway ?? new MockPayGate();
  const clock = options.clock ?? (() => new Date());
  const orders = new OrderRepository(options.seed ?? seedOrders());
  const ledger = new TransactionLedger();
  const idempotency = new IdempotencyStore();
  const provider = createPaymentProvider(gateway);

  const payments = new PaymentService({ orders, provider, idempotency, ledger, clock });
  const refunds = new RefundService({ orders, idempotency, ledger, clock });

  const router = new Router();
  router.use(errorHandler);
  registerOrderRoutes(router, { orders });
  registerPaymentRoutes(router, { payments });
  registerRefundRoutes(router, { refunds });

  return { handle: (request) => router.handle(request), gateway, orders, ledger };
}
