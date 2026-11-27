import { requireJsonObject } from '../middleware/json-body.ts';
import { parseIdempotencyKey } from '../utils/idempotency.ts';
import { parsePositivePaise } from '../utils/money.ts';
import type { Router } from '../utils/router.ts';
import type { RefundService } from './refund-service.ts';

export interface RefundRouteDeps {
  refunds: RefundService;
}

export function registerRefundRoutes(router: Router, deps: RefundRouteDeps): void {
  router.post('/api/orders/:orderId/refund', async (request) => {
    const body = requireJsonObject(request.body);
    const amount = parsePositivePaise(body.amount);
    const idempotencyKey = parseIdempotencyKey(body.idempotencyKey);
    const result = await deps.refunds.refund({ orderId: request.params.orderId!, amount, idempotencyKey });
    return { status: 201, body: result };
  });
}
