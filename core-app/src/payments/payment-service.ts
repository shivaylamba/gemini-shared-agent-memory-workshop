import { AppError } from '../utils/errors.ts';
import { fingerprintOf, type IdempotencyStore } from '../utils/idempotency.ts';
import { withRetry } from '../utils/retry.ts';
import { isRetryableProviderError, ProviderError, type PaymentProvider } from '../integrations/payment-provider.ts';
import type { OrderRepository } from '../orders/order-repository.ts';
import { toOrderView, type OrderView } from '../orders/order.ts';
import type { Transaction, TransactionLedger } from './transaction-ledger.ts';

export interface PaymentServiceDeps {
  orders: OrderRepository;
  provider: PaymentProvider;
  idempotency: IdempotencyStore;
  ledger: TransactionLedger;
  clock: () => Date;
}

export interface PayOrderInput {
  orderId: string;
  idempotencyKey: string;
}

export interface PaymentResult {
  transaction: Transaction;
  order: OrderView;
}

/**
 * Charges an order through the current payment provider.
 *
 * This is the reference example of ShopFlow's payment conventions:
 *   1. amounts are integer paise (ADR-001)
 *   2. the provider comes from createPaymentProvider() (ADR-002)
 *   3. the whole operation is wrapped in IdempotencyStore.run (ADR-003)
 *   4. failures are thrown as AppError and formatted by the error handler (ADR-004)
 *   5. retryable provider errors are retried with the same idempotency key
 */
export class PaymentService {
  private readonly deps: PaymentServiceDeps;

  constructor(deps: PaymentServiceDeps) {
    this.deps = deps;
  }

  async pay(input: PayOrderInput): Promise<PaymentResult> {
    const { orders, provider, idempotency, ledger, clock } = this.deps;
    const scope = `payment:${input.orderId}`;

    return idempotency.run(scope, input.idempotencyKey, fingerprintOf({ orderId: input.orderId }), async () => {
      const order = orders.get(input.orderId);
      if (order.status !== 'pending') {
        throw new AppError('ORDER_ALREADY_PAID', `Order ${order.id} has already been paid`, { orderId: order.id });
      }

      const charge = await withRetry(
        () => provider.charge({ amount: order.amount, reference: order.id, idempotencyKey: input.idempotencyKey }),
        { attempts: 3, isRetryable: isRetryableProviderError },
      ).catch((error: unknown) => {
        throw providerFailure(error, order.id);
      });

      const now = clock().toISOString();
      const saved = orders.save({ ...order, status: 'paid', chargeId: charge.providerChargeId, updatedAt: now });
      const transaction = ledger.record({
        orderId: order.id,
        type: 'charge',
        amount: charge.amount,
        provider: provider.name,
        providerReference: charge.providerChargeId,
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
      });
      return { transaction, order: toOrderView(saved) };
    });
  }
}

export function providerFailure(error: unknown, orderId: string): AppError {
  if (error instanceof ProviderError) {
    return new AppError('PAYMENT_PROVIDER_ERROR', 'The payment provider could not process the request', {
      orderId,
      providerCode: error.code,
    });
  }
  return new AppError('INTERNAL_ERROR', 'An unexpected error occurred');
}
