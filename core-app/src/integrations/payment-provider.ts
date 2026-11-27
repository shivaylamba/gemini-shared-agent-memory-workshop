import type { Paise } from '../utils/money.ts';

/** Provider-agnostic payment interface used by ShopFlow services. */
export interface PaymentProvider {
  readonly name: string;
  charge(request: ChargeRequest): Promise<ProviderCharge>;
  refund(request: RefundRequest): Promise<ProviderRefund>;
}

export interface ChargeRequest {
  amount: Paise;
  reference: string;
  idempotencyKey: string;
}

export interface RefundRequest {
  chargeId: string;
  amount: Paise;
  reference: string;
  idempotencyKey: string;
}

export interface ProviderCharge {
  providerChargeId: string;
  amount: Paise;
}

export interface ProviderRefund {
  providerRefundId: string;
  amount: Paise;
}

/** Normalised provider failure. `retryable` tells callers whether withRetry may try again. */
export class ProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function isRetryableProviderError(error: unknown): boolean {
  return error instanceof ProviderError && error.retryable;
}
