---
title: Standard error responses
status: current
category: runbooks
source: [docs/decisions/ADR-004-standard-error-envelope.md, src/utils/errors.ts, src/middleware/error-handler.ts]
verified_at: 2026-11-27
tags: [errors, api, validation, refunds]
contributed_by: workshop-checkpoint
---
# Standard error responses

## Decision
Every error response is `{ "error": { "code", "message", "details"? } }`, using codes and HTTP
statuses from `ERROR_CATALOGUE` in `src/utils/errors.ts`.

## Rationale
Clients branch on stable codes. A single middleware keeps the format consistent.

## Implementation guidance
- Throw `new AppError(code, message, details?)`; the `errorHandler` registered on the router builds
  the response. Never hand-build error bodies or invent codes.
- Refund-related codes already exist: `ORDER_NOT_FOUND` (404), `ORDER_NOT_REFUNDABLE` (409),
  `IDEMPOTENCY_KEY_REUSED` (409), `REFUND_EXCEEDS_REFUNDABLE` (422), `PAYMENT_PROVIDER_ERROR` (502),
  `VALIDATION_FAILED` (400).
- Convert provider failures with `providerFailure(error, orderId)` from `payment-service.ts`.

## Source
- `docs/decisions/ADR-004-standard-error-envelope.md`
- `src/utils/errors.ts`
- `src/middleware/error-handler.ts`
