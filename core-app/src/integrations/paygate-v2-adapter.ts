import { GatewayError, type MockPayGate } from './mock-paygate.ts';
import {
  ProviderError,
  type ChargeRequest,
  type PaymentProvider,
  type ProviderCharge,
  type ProviderRefund,
  type RefundRequest,
} from './payment-provider.ts';

/**
 * Current PayGate adapter (ADR-002). Sends integer paise and forwards the
 * idempotency key, so retries can never duplicate a charge or refund.
 */
export class PayGateV2Adapter implements PaymentProvider {
  readonly name = 'paygate-v2';
  private readonly gateway: MockPayGate;

  constructor(gateway: MockPayGate) {
    this.gateway = gateway;
  }

  async charge(request: ChargeRequest): Promise<ProviderCharge> {
    try {
      const charge = await this.gateway.v2.createCharge({
        amount_paise: request.amount,
        currency: 'INR',
        reference: request.reference,
        idempotency_key: request.idempotencyKey,
      });
      return { providerChargeId: charge.id, amount: charge.amount_paise };
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async refund(request: RefundRequest): Promise<ProviderRefund> {
    try {
      const refund = await this.gateway.v2.createRefund({
        charge_id: request.chargeId,
        amount_paise: request.amount,
        reference: request.reference,
        idempotency_key: request.idempotencyKey,
      });
      return { providerRefundId: refund.id, amount: refund.amount_paise };
    } catch (error) {
      throw toProviderError(error);
    }
  }
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof GatewayError) return new ProviderError(error.code, error.message, error.retryable);
  return new ProviderError('UNKNOWN', error instanceof Error ? error.message : String(error), false);
}
