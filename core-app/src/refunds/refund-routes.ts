import type { Router } from '../utils/router.ts';
import type { RefundService } from './refund-service.ts';

export interface RefundRouteDeps {
  refunds: RefundService;
}

export function registerRefundRoutes(router: Router, deps: RefundRouteDeps): void {
  // TODO(workshop): register POST /api/orders/:orderId/refund (see docs/architecture/api.md).
  void router;
  void deps;
}
