# ShopFlow architecture overview

_Last reviewed: 2026-10-14_

ShopFlow exposes a JSON API through a tiny framework-free router (`src/utils/router.ts`).
`src/app.ts` builds everything with plain constructor injection; there is no DI container.

## Request flow

```text
HTTP request
  -> Router (src/utils/router.ts)
  -> errorHandler middleware (src/middleware/error-handler.ts)
  -> route handler (src/*/…-routes.ts)      validates input
  -> service (PaymentService, RefundService) business rules, idempotency, provider calls
  -> OrderRepository / TransactionLedger     in-memory state
```

Route handlers stay thin. They parse and validate the request body and call one service method.
Services own the business rules and talk to the payment provider through the `PaymentProvider`
interface (`src/integrations/payment-provider.ts`).

## Modules

| Module | Responsibility |
|---|---|
| `orders/` | `Order` model, `OrderRepository`, order view (`toOrderView`) and `GET /api/orders/:orderId` |
| `payments/` | `PaymentService.pay`, `TransactionLedger`, `POST /api/orders/:orderId/pay` |
| `refunds/` | Refunds (planned, see `api.md`) |
| `integrations/` | PayGate adapters. `createPaymentProvider()` returns the adapter new code must use |
| `utils/` | `money.ts`, `idempotency.ts`, `retry.ts`, `errors.ts`, `router.ts` |

## Cross-cutting rules

These are recorded as ADRs in `docs/decisions/`:

- ADR-001: money is integer paise
- ADR-002: PayGate v2 through `createPaymentProvider()`; the v1 adapter is deprecated
- ADR-003: idempotent state-changing requests
- ADR-004: standard error envelope
- ADR-005: refund accounting

`PaymentService` (`src/payments/payment-service.ts`) is the reference implementation of these rules.
