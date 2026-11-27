/**
 * Deterministic in-memory stand-in for the PayGate payment gateway.
 * No network, no real money. Tests and the workshop grader inspect `calls`.
 *
 * PayGate exposes two API versions:
 *   - v2 (current): amounts in integer paise, idempotency keys supported.
 *   - v1 (legacy):  amounts in rupees (floating point), no idempotency.
 */

export interface GatewayCall {
  api: 'v1' | 'v2';
  operation: 'createCharge' | 'createRefund' | 'charge' | 'refund';
  payload: Record<string, unknown>;
}

export class GatewayError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface InjectedFailure {
  code: string;
  message?: string;
  retryable: boolean;
}

interface ChargeRecord {
  id: string;
  amountPaise: number;
  refundedPaise: number;
}

interface V2CreateChargeRequest {
  amount_paise: number;
  currency: 'INR';
  reference: string;
  idempotency_key: string;
}

interface V2CreateRefundRequest {
  charge_id: string;
  amount_paise: number;
  reference: string;
  idempotency_key: string;
}

export interface V2Charge {
  id: string;
  status: 'captured';
  amount_paise: number;
}

export interface V2Refund {
  id: string;
  charge_id: string;
  status: 'processed';
  amount_paise: number;
}

export class MockPayGate {
  readonly calls: GatewayCall[] = [];
  private readonly charges = new Map<string, ChargeRecord>();
  private readonly failures: Record<string, InjectedFailure[]> = {};
  private chargeSeq = 0;
  private refundSeq = 0;

  readonly v2 = {
    createCharge: async (request: V2CreateChargeRequest): Promise<V2Charge> => {
      this.calls.push({ api: 'v2', operation: 'createCharge', payload: { ...request } });
      this.maybeFail('createCharge');
      assertIntegerPaise(request.amount_paise);
      const id = `ch_${String(++this.chargeSeq).padStart(4, '0')}`;
      this.charges.set(id, { id, amountPaise: request.amount_paise, refundedPaise: 0 });
      return { id, status: 'captured', amount_paise: request.amount_paise };
    },

    createRefund: async (request: V2CreateRefundRequest): Promise<V2Refund> => {
      this.calls.push({ api: 'v2', operation: 'createRefund', payload: { ...request } });
      this.maybeFail('createRefund');
      assertIntegerPaise(request.amount_paise);
      const charge = this.charges.get(request.charge_id);
      if (!charge) throw new GatewayError('CHARGE_NOT_FOUND', `Unknown charge ${request.charge_id}`, false);
      if (request.amount_paise <= 0 || charge.refundedPaise + request.amount_paise > charge.amountPaise) {
        throw new GatewayError('REFUND_AMOUNT_INVALID', 'Refund exceeds the captured amount', false);
      }
      charge.refundedPaise += request.amount_paise;
      const id = `rf_${String(++this.refundSeq).padStart(4, '0')}`;
      return { id, charge_id: charge.id, status: 'processed', amount_paise: request.amount_paise };
    },
  };

  /** @deprecated PayGate v1 — rupees as floats, no idempotency. See ADR-002. */
  readonly v1 = {
    refund: async (request: { txn_id: string; amount_rupees: number }): Promise<{ refund_id: string; ok: boolean }> => {
      this.calls.push({ api: 'v1', operation: 'refund', payload: { ...request } });
      this.maybeFail('refund');
      const charge = this.charges.get(request.txn_id);
      if (!charge) throw new GatewayError('TXN_NOT_FOUND', `Unknown transaction ${request.txn_id}`, false);
      const amountPaise = Math.round(request.amount_rupees * 100);
      charge.refundedPaise += amountPaise;
      const id = `v1rf_${String(++this.refundSeq).padStart(4, '0')}`;
      return { refund_id: id, ok: true };
    },
  };

  /** Makes the next call(s) to an operation fail. Failures are consumed in order. */
  failNext(operation: 'createCharge' | 'createRefund' | 'refund', failure: InjectedFailure, times = 1): void {
    const queue = (this.failures[operation] ??= []);
    for (let i = 0; i < times; i++) queue.push(failure);
  }

  callsTo(operation: GatewayCall['operation']): GatewayCall[] {
    return this.calls.filter((call) => call.operation === operation);
  }

  private maybeFail(operation: string): void {
    const failure = this.failures[operation]?.shift();
    if (failure) {
      throw new GatewayError(failure.code, failure.message ?? `Injected ${failure.code}`, failure.retryable);
    }
  }
}

function assertIntegerPaise(amount: number): void {
  if (!Number.isSafeInteger(amount)) {
    throw new GatewayError('INVALID_AMOUNT', 'amount_paise must be an integer', false);
  }
}
