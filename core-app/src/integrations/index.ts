import type { MockPayGate } from './mock-paygate.ts';
import type { PaymentProvider } from './payment-provider.ts';
import { PayGateV2Adapter } from './paygate-v2-adapter.ts';

export { LegacyPayGateAdapter } from './legacy-paygate-adapter.ts';
export { MockPayGate, GatewayError } from './mock-paygate.ts';
export { PayGateV2Adapter } from './paygate-v2-adapter.ts';
export { ProviderError, isRetryableProviderError } from './payment-provider.ts';
export type { PaymentProvider } from './payment-provider.ts';

/** The one supported way to obtain the payment provider for new code (ADR-002). */
export function createPaymentProvider(gateway: MockPayGate): PaymentProvider {
  return new PayGateV2Adapter(gateway);
}
