# ADR-002: Use the PayGate v2 adapter for all provider calls

- Status: Accepted
- Date: 2024-03-18
- Supersedes: the provider guidance in `runbooks/refunds-manual-2023.md`

## Context

PayGate v1 accepts rupees as floating-point numbers and does not support idempotency keys. When we
wrote the 2023 refund runbook, v2 had no refund endpoint, so manual refunds went through
`LegacyPayGateAdapter`. PayGate v2 now supports charges and refunds in integer paise, with
idempotency keys.

## Decision

- New code obtains the provider with `createPaymentProvider()` from `src/integrations/index.ts`.
  That returns `PayGateV2Adapter`, which implements `PaymentProvider` (`charge`, `refund`).
- `LegacyPayGateAdapter` is deprecated. Its only remaining user is read-only reconciliation
  (`src/payments/reconciliation.ts`). Do not use it for new charges or refunds.
- Provider failures surface as `ProviderError` with a `retryable` flag. Services convert them to
  `PAYMENT_PROVIDER_ERROR` (ADR-004).

## Consequences

- Refunds go through `PaymentProvider.refund()`. They need the order's `chargeId`, and they forward
  the client's idempotency key.
- v1 will be switched off after the 2027 reconciliation window closes.
