# ADR-005: Refund accounting

- Status: Accepted
- Date: 2026-09-22

## Context

Customer support needs to refund orders partially, sometimes in several steps, for example one item
first and then shipping.

## Decision

- Only paid orders (`paid` or `partially_refunded`) can be refunded. Refunding a `pending` order fails
  with `ORDER_NOT_REFUNDABLE`.
- `Order.refundedAmount` is the running total of successful refunds, in paise.
- A refund may not exceed the remaining refundable amount, `amount - refundedAmount`
  (`refundableAmountOf()` in `src/orders/order.ts`). Larger requests fail with
  `REFUND_EXCEEDS_REFUNDABLE` before any provider call.
- After a successful refund, the status is `refunded` when nothing remains, otherwise `partially_refunded`.
- Every successful refund is recorded in the `TransactionLedger` with type `refund`.
- A failed provider refund changes nothing.

## Consequences

Refunds follow the same idempotency rules as payments (ADR-003), with their own scope.
