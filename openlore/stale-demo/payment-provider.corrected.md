---
title: Use the current PayGate v2 provider
status: current
category: decisions
source: [docs/decisions/ADR-002-paygate-v2-adapter.md, src/integrations/index.ts, src/integrations/payment-provider.ts, src/integrations/legacy-paygate-adapter.ts]
verified_at: 2026-11-27
tags: [payments, refunds, provider, paygate, adapter, deprecated]
contributed_by: workshop-checkpoint
---
# Use the current PayGate v2 provider

## Decision
All charges and refunds go through the `PaymentProvider` returned by `createPaymentProvider()`
(`PayGateV2Adapter`). `LegacyPayGateAdapter` (PayGate v1, rupees, no idempotency) is deprecated.

## Rationale
v2 takes integer paise and idempotency keys. The 2023 manual-refund runbook predates v2 refunds and
is superseded by ADR-002.

## Implementation guidance
- Inject the existing `provider` from `src/app.ts` (the same instance `PaymentService` uses) into
  new services. Do not construct `LegacyPayGateAdapter`.
- Refund with `provider.refund({ chargeId: order.chargeId, amount, reference: order.id, idempotencyKey })`.
- Provider failures are `ProviderError` with a `retryable` flag (`isRetryableProviderError`).
- Ignore `docs/runbooks/refunds-manual-2023.md` for new code.

## Source
- `docs/decisions/ADR-002-paygate-v2-adapter.md`
- `src/integrations/index.ts`
- `src/integrations/payment-provider.ts`
- `src/integrations/legacy-paygate-adapter.ts` (marked @deprecated)
