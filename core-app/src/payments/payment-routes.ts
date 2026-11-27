import { requireJsonObject } from '../middleware/json-body.ts';
import { parseIdempotencyKey } from '../utils/idempotency.ts';
import type { Router } from '../utils/router.ts';
import type { PaymentService } from './payment-service.ts';

export interface PaymentRouteDeps {
  payments: PaymentService;
}

export function registerPaymentRoutes(router: Router, deps: PaymentRouteDeps): void {
  router.post('/api/orders/:orderId/pay', async (request) => {
    const body = requireJsonObject(request.body);
    const idempotencyKey = parseIdempotencyKey(body.idempotencyKey);
    const result = await deps.payments.pay({ orderId: request.params.orderId!, idempotencyKey });
    return { status: 201, body: result };
  });
}
