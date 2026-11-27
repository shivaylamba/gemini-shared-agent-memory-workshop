---
title: Refund idempotency
status: current
category: decisions
source: [src/utils/idempotency.ts, docs/decisions/ADR-003-idempotent-requests.md]
verified_at: 2026-12-09
tags: [payments, refunds, idempotency]
---
# Refund idempotency

## Decision
Refund requests with the same idempotency key must not trigger duplicate provider calls.

## Rationale
Network failures cause clients to retry requests.

## Implementation guidance
Reuse the existing idempotency utility (`IdempotencyStore.run`) with an operation-specific scope.

## Source
- `src/utils/idempotency.ts`
- `docs/decisions/ADR-003-idempotent-requests.md`
