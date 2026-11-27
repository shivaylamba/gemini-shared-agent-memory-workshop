---
title: ShopFlow application overview
status: current
category: architecture
source: [docs/architecture/overview.md, src/app.ts, src/utils/router.ts]
verified_at: 2026-11-27
tags: [architecture, routing, services]
contributed_by: workshop-checkpoint
---
# ShopFlow application overview

## Decision
ShopFlow is a framework-free TypeScript backend. `src/app.ts` wires repositories, services and
routes with constructor injection. Requests flow Router → `errorHandler` middleware → thin route
handler (validation only) → service (business rules, idempotency, provider calls) → in-memory
`OrderRepository` / `TransactionLedger`.

## Rationale
Thin handlers and service-owned rules keep conventions in one place. `PaymentService` is the
reference implementation of every cross-cutting rule.

## Implementation guidance
- New endpoints: add a `register…Routes(router, deps)` function and call it from `createApp`.
- New dependencies go through the service's deps object, wired in `src/app.ts`.
- TypeScript runs through Node type stripping: `.ts` import extensions, `import type`, no enums or
  parameter properties.
- Read `src/payments/payment-service.ts` before writing a new payment-related service.

## Source
- `docs/architecture/overview.md`
- `src/app.ts`
- `src/utils/router.ts`
