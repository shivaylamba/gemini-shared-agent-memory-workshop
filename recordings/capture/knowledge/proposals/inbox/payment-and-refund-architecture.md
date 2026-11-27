---
title: Payment and Refund Architecture
status: current
category: architecture
source: [src/payments/payment-service.ts, src/refunds/refund-service.ts, src/orders/order.ts, docs/architecture/overview.md, docs/decisions/ADR-005-refund-accounting.md]
verified_at: 2026-11-27
tags: [payment, refund, architecture, service, idempotency]
---
# Payment and Refund Architecture

## Decision
ShopFlow structures payment and refund capabilities around distinct domain services (`PaymentService`, `RefundService`) that coordinate between persistence (`OrderRepository`, `TransactionLedger`), idempotency guards (`IdempotencyStore`), and payment provider adapters (`PaymentProvider`).

## Rationale
Separating concerns ensures business rules (such as order status checks, partial vs full refunds, and idempotency scoping) are tested independently from HTTP routing and third-party gateway interactions.

## Implementation guidance
- Use `PaymentService` and `RefundService` as models for business logic coordination.
- Wrap external provider calls and state transitions within idempotency scopes (e.g. `payment:{orderId}` and `refund:{orderId}`).
- Record all successful financial transactions in the `TransactionLedger`.

## Source
- src/payments/payment-service.ts
- src/refunds/refund-service.ts
- src/orders/order.ts
- docs/architecture/overview.md
- docs/decisions/ADR-005-refund-accounting.md
