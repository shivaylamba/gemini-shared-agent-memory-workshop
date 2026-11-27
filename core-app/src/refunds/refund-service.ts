import type { IdempotencyStore } from '../utils/idempotency.ts';
import type { Paise } from '../utils/money.ts';
import type { OrderRepository } from '../orders/order-repository.ts';
import type { OrderView } from '../orders/order.ts';
import type { TransactionLedger } from '../payments/transaction-ledger.ts';

export interface RefundServiceDeps {
  orders: OrderRepository;
  idempotency: IdempotencyStore;
  ledger: TransactionLedger;
  clock: () => Date;
  // TODO(workshop): refunds also need access to the payment provider.
}

export interface RefundInput {
  orderId: string;
  amount: Paise;
  idempotencyKey: string;
}

export interface Refund {
  id: string;
  orderId: string;
  amount: Paise;
  status: 'succeeded';
  providerRefundId: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface RefundResult {
  refund: Refund;
  order: OrderView;
}

/**
 * Refunds part or all of a paid order.
 * Contract: docs/architecture/api.md ("POST /api/orders/:orderId/refund").
 */
export class RefundService {
  private readonly deps: RefundServiceDeps;

  constructor(deps: RefundServiceDeps) {
    this.deps = deps;
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // TODO(workshop): implement the refund operation.
    void this.deps;
    void input;
    throw new Error('RefundService.refund is not implemented yet');
  }
}
