---
title: Refund idempotency
status: current
category: decisions
source: [docs/decisions/ADR-003-idempotent-requests.md, src/utils/idempotency.ts, src/payments/payment-service.ts]
verified_at: 2026-11-27
tags: [payments, refunds, idempotency, retries]
contributed_by: workshop-checkpoint
---
# Refund idempotency

## Decision
Refund requests carry an `idempotencyKey`. The same key with the same request must return the
original result without a second provider call; the same key with a different amount fails with
`IDEMPOTENCY_KEY_REUSED` (409).

## Rationale
Clients retry after timeouts. Without idempotency a retry could refund twice.

## Implementation guidance
- Validate the key with `parseIdempotencyKey()`.
- Wrap the whole refund in `IdempotencyStore.run(scope, key, fingerprint, op)` with its own scope
  (for example `refund:<orderId>`) and a fingerprint from `fingerprintOf({ orderId, amount })`.
- Only successes are stored; a failed attempt can be retried with the same key.
- Forward the same key to the provider and retry retryable errors with `withRetry` (same key).
- `PaymentService.pay` shows the complete pattern.

## Source
- `docs/decisions/ADR-003-idempotent-requests.md`
- `src/utils/idempotency.ts`
- `src/payments/payment-service.ts`
