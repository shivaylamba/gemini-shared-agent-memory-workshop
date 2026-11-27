---
title: Refund workflow and accounting
status: current
category: runbooks
source: [docs/decisions/ADR-005-refund-accounting.md, docs/architecture/api.md, src/orders/order.ts, src/refunds/refund-service.ts]
verified_at: 2026-11-27
tags: [refunds, accounting, api, orders]
contributed_by: workshop-checkpoint
---
# Refund workflow and accounting

## Decision
`POST /api/orders/:orderId/refund` with `{ amount, idempotencyKey }` refunds part or all of a paid
order and returns `201 { refund, order }` (contract in `docs/architecture/api.md`).

## Rationale
Support needs partial and multi-step refunds without ever refunding more than was charged.

## Implementation guidance
- Only `paid` or `partially_refunded` orders can be refunded; `pending` → `ORDER_NOT_REFUNDABLE`.
- Reject amounts above `refundableAmountOf(order)` (`amount - refundedAmount`) with
  `REFUND_EXCEEDS_REFUNDABLE` before calling the provider.
- On success: add to `refundedAmount`, set status `refunded` when nothing remains, else
  `partially_refunded`, record a `refund` entry in `TransactionLedger`, return `toOrderView(order)`.
- On provider failure change nothing.
- The service skeleton is `src/refunds/refund-service.ts`; register the route in
  `src/refunds/refund-routes.ts` and wire dependencies in `src/app.ts`.

## Source
- `docs/decisions/ADR-005-refund-accounting.md`
- `docs/architecture/api.md`
- `src/orders/order.ts`
- `src/refunds/refund-service.ts`
