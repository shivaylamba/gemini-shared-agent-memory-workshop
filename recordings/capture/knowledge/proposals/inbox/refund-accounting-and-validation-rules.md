---
title: Refund Accounting and Validation Rules
status: current
category: decisions
source: [src/orders/order.ts, docs/decisions/ADR-005-refund-accounting.md, src/refunds/refund-service.ts]
verified_at: 2026-11-27
tags: [refund, accounting, validation, adr-005]
---
# Refund Accounting and Validation Rules

## Decision
Refunds adhere to strict validation and accounting rules defined in ADR-005:
1. Only paid orders (`paid` or `partially_refunded`) are refundable; refunding a `pending` order fails with `ORDER_NOT_REFUNDABLE`.
2. Refund amounts cannot exceed the remaining refundable amount (`refundableAmountOf()`), failing with `REFUND_EXCEEDS_REFUNDABLE` prior to provider calls.
3. Order statuses transition to `partially_refunded` or `refunded` based on remaining balance.
4. Successful refunds are logged in the `TransactionLedger` with type `refund`.

## Rationale
Prevents over-refunding, maintains accurate audit trails, and ensures consistent state transitions across partial and full refund operations.

## Implementation guidance
- Verify order eligibility and refundable amounts using `refundableAmountOf()` from `src/orders/order.ts` before invoking payment provider refund methods.
- Throw `AppError` with error codes `ORDER_NOT_REFUNDABLE` or `REFUND_EXCEEDS_REFUNDABLE` when validation fails.
- Record transactions in the ledger and update `refundedAmount` and `status` atomically or sequentially upon successful provider response.

## Source
- src/orders/order.ts
- docs/decisions/ADR-005-refund-accounting.md
- src/refunds/refund-service.ts
