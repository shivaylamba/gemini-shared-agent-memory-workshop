---
title: Payment Provider Abstraction and Idempotency
status: current
category: decisions
source: [src/integrations/payment-provider.ts, src/integrations/paygate-v2-adapter.ts, src/payments/payment-service.ts, docs/decisions/ADR-002-paygate-v2-adapter.md, docs/decisions/ADR-003-idempotent-requests.md]
verified_at: 2026-11-27
tags: [payment-provider, idempotency, retry, adr-002, adr-003]
---
# Payment Provider Abstraction and Idempotency

## Decision
All payment and refund provider interactions are abstracted via the `PaymentProvider` interface (implemented by `PayGateV2Adapter`), using integer paise amounts and idempotency keys to prevent duplicate charges or refunds across retries.

## Rationale
Decouples domain services from concrete third-party gateway APIs while guaranteeing safe retries on network failures or timeouts.

## Implementation guidance
- Use `PaymentProvider.charge()` and `PaymentProvider.refund()` with `idempotencyKey` passed through from client requests.
- Wrap operations in `IdempotencyStore.run()` with appropriate scopes (e.g. `payment:{orderId}` or `refund:{orderId}`).
- Wrap retryable provider errors using `withRetry` and `isRetryableProviderError`.

## Source
- src/integrations/payment-provider.ts
- src/integrations/paygate-v2-adapter.ts
- src/payments/payment-service.ts
- docs/decisions/ADR-002-paygate-v2-adapter.md
- docs/decisions/ADR-003-idempotent-requests.md
