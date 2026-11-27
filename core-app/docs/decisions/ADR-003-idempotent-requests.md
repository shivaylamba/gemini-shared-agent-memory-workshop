# ADR-003: Idempotent state-changing requests

- Status: Accepted
- Date: 2024-03-18

## Context

Mobile clients retry requests after timeouts. Without protection, a retried payment could charge a
customer twice.

## Decision

Every state-changing endpoint requires a client-supplied `idempotencyKey`, validated with
`parseIdempotencyKey()`. The operation runs inside `IdempotencyStore.run(scope, key, fingerprint, op)`
(`src/utils/idempotency.ts`):

- The scope is operation-specific, for example `payment:<orderId>`. Use a distinct scope per operation.
- The fingerprint is built with `fingerprintOf()` from the fields that define the request.
- The same key and fingerprint return the stored result and do not call the provider again.
- The same key with a different fingerprint fails with `IDEMPOTENCY_KEY_REUSED`.
- Only successes are stored. A failed attempt releases the key, so clients can retry with the same key.

Provider calls forward the same key to PayGate. Retries (`withRetry`) reuse it.

## Consequences

`PaymentService.pay` is the reference example.
