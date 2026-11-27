# Runbook: payment provider incidents

_Owner: payments on-call · Last updated: 2026-08-02_

## Symptoms

- API responses with `502 PAYMENT_PROVIDER_ERROR`
- `ProviderError` entries with codes such as `GATEWAY_TIMEOUT`, `BANK_DECLINED` or `CARD_DECLINED`

## How the code reacts

- Retryable provider errors (`ProviderError.retryable === true`, for example `GATEWAY_TIMEOUT`) are
  retried up to 3 attempts with `withRetry` (`src/utils/retry.ts`). Every attempt reuses the client's
  idempotency key, so PayGate v2 cannot create duplicates.
- Non-retryable errors (declines, invalid amounts) are returned immediately as
  `502 PAYMENT_PROVIDER_ERROR`, with `details.providerCode`.
- Nothing is recorded in the ledger or on the order when the provider call fails, and the
  idempotency key is released (ADR-003). Clients may retry with the same key.

## What to do

1. Check the PayGate status page.
2. If PayGate is healthy, look for repeated `providerCode` values in logs.
3. Do not ask customers to retry with new idempotency keys. The same key is safe.
