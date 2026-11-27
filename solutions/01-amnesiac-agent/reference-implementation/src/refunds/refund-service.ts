import { AppError } from '../utils/errors.ts';
import { fingerprintOf, type IdempotencyStore } from '../utils/idempotency.ts';
import type { Paise } from '../utils/money.ts';
import { withRetry } from '../utils/retry.ts';
import { isRetryableProviderError, type PaymentProvider } from '../integrations/payment-provider.ts';
import type { OrderRepository } from '../orders/order-repository.ts';
import { refundableAmountOf, toOrderView, type OrderView } from '../orders/order.ts';
import { providerFailure } from '../payments/payment-service.ts';
import type { TransactionLedger } from '../payments/transaction-ledger.ts';

export interface RefundServiceDeps {
  orders: OrderRepository;
  idempotency: IdempotencyStore;
  ledger: TransactionLedger;
  clock: () => Date;
  /** The current provider from createPaymentProvider() (ADR-002) — never the legacy adapter. */
  provider: PaymentProvider;
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
    const { orders, provider, idempotency, ledger, clock } = this.deps;
    const scope = `refund:${input.orderId}`;
    const fingerprint = fingerprintOf({ orderId: input.orderId, amount: input.amount });

    // ADR-003: replays return the stored result; failures release the key.
    return idempotency.run(scope, input.idempotencyKey, fingerprint, async () => {
      const order = orders.get(input.orderId);
      if (order.status === 'pending' || !order.chargeId) {
        throw new AppError('ORDER_NOT_REFUNDABLE', `Order ${order.id} has not been paid`, { orderId: order.id });
      }

      // ADR-005: never refund more than what is left.
      const refundable = refundableAmountOf(order);
      if (input.amount > refundable) {
        throw new AppError('REFUND_EXCEEDS_REFUNDABLE', 'Refund amount exceeds the remaining refundable amount', {
          orderId: order.id,
          requestedAmount: input.amount,
          refundableAmount: refundable,
        });
      }

      // ADR-002 + payment-incidents runbook: current adapter, same key on retries.
      const chargeId = order.chargeId;
      const providerRefund = await withRetry(
        () => provider.refund({ chargeId, amount: input.amount, reference: order.id, idempotencyKey: input.idempotencyKey }),
        { attempts: 3, isRetryable: isRetryableProviderError },
      ).catch((error: unknown) => {
        throw providerFailure(error, order.id);
      });

      const now = clock().toISOString();
      const refundedAmount = order.refundedAmount + providerRefund.amount;
      const saved = orders.save({
        ...order,
        refundedAmount,
        status: refundedAmount >= order.amount ? 'refunded' : 'partially_refunded',
        updatedAt: now,
      });
      const transaction = ledger.record({
        orderId: order.id,
        type: 'refund',
        amount: providerRefund.amount,
        provider: provider.name,
        providerReference: providerRefund.providerRefundId,
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
      });

      return {
        refund: {
          id: transaction.id,
          orderId: order.id,
          amount: providerRefund.amount,
          status: 'succeeded',
          providerRefundId: providerRefund.providerRefundId,
          idempotencyKey: input.idempotencyKey,
          createdAt: now,
        },
        order: toOrderView(saved),
      };
    });
  }
}
