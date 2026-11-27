# ShopFlow

ShopFlow is a small order and payment backend. It keeps orders in memory and charges them through
PayGate, a payment gateway that is simulated in memory (`src/integrations/mock-paygate.ts`).
No real money or network calls are involved.

## Layout

```text
src/
  app.ts               wires repositories, services and routes
  orders/              order model, repository, GET /api/orders/:orderId
  payments/            PaymentService (charging), ledger, POST /api/orders/:orderId/pay
  refunds/             refund service and routes (refunds are not implemented yet)
  integrations/        PayGate adapters and the provider interface
  middleware/          error handler, JSON body helper
  utils/               money, idempotency, retry, errors, router
fixtures/              demo orders
docs/                  architecture notes, decisions (ADRs) and runbooks
tests/                 node:test suites
```

## Running

TypeScript runs directly on Node.js 22.18+ through type stripping, so there is no build step:

- relative imports use explicit `.ts` extensions
- type-only imports use `import type`
- only erasable syntax is allowed (no `enum`, `namespace` or constructor parameter properties)

```bash
npm test               # node --test "tests/**/*.test.ts"
node src/server.ts     # optional local HTTP server on port 3100
```

## Where to look

- `docs/architecture/overview.md`: how a request flows through the app
- `docs/architecture/api.md`: endpoint contracts
- `docs/decisions/`: architecture decision records
- `docs/runbooks/`: operational procedures
