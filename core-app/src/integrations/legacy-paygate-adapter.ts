import type { MockPayGate } from './mock-paygate.ts';
import { paiseToRupees, type Paise } from '../utils/money.ts';

/**
 * @deprecated Superseded by PayGateV2Adapter (ADR-002, March 2024).
 *
 * Talks to the PayGate v1 API, which takes rupees as floating-point numbers and
 * has no idempotency support. Kept only so `payments/reconciliation.ts` can
 * read historical v1 settlements. Do not use for new charges or refunds.
 */
export class LegacyPayGateAdapter {
  readonly name = 'paygate-v1-legacy';
  private readonly gateway: MockPayGate;

  constructor(gateway: MockPayGate) {
    this.gateway = gateway;
  }

  /** Refunds a v1 transaction. Amount is converted to rupees for the v1 API. */
  async refund(transactionId: string, amount: Paise): Promise<{ refundId: string }> {
    const result = await this.gateway.v1.refund({ txn_id: transactionId, amount_rupees: paiseToRupees(amount) });
    return { refundId: result.refund_id };
  }
}
