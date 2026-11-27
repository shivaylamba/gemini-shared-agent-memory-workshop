# Solution 01: The Amnesiac Agent

```bash
npm run solution -- 01
```

This runs the **human-written reference implementation** in its own workspace
(`.workshop/solutions/01/`) and grades it with the same visible tests and hidden checks as every run.
It is not an agent run. For a recorded agent run, use `npm run exercise -- 01 --mode replay` (needs a
genuine recording).

## The reference implementation

[`reference-implementation/`](reference-implementation) overlays three files on `core-app/`:

| File | What it does | Constraint |
|---|---|---|
| `src/refunds/refund-routes.ts` | Validates the body with `parsePositivePaise` and `parseIdempotencyKey`, then registers `POST /api/orders/:orderId/refund` (201) | ADR-001, ADR-004 |
| `src/refunds/refund-service.ts` | Wraps the refund in `IdempotencyStore.run` with scope `refund:<orderId>`; enforces `refundableAmountOf`; calls `provider.refund` via `withRetry` with the same key; updates `refundedAmount` and status; records a ledger entry | ADR-002, ADR-003, ADR-005 |
| `src/app.ts` | One line: passes the existing `provider` (from `createPaymentProvider`) into `RefundService` | ADR-002 |

## The ten hidden checks

The checks live in `evaluation/graders/`; agents never see them. Full refund, partial refund,
invalid or non-integer amounts, excessive amount, unknown order, idempotent retry, cumulative
accounting, current adapter, standardized errors, and provider failure.

## Common baseline mistakes

- Following `docs/runbooks/refunds-manual-2023.md` and using `LegacyPayGateAdapter` (rupees, no idempotency)
- Accepting `150.5` or `"15000"` as an amount
- Hand-building `{ error: "..." }` instead of throwing `AppError`
- Caching failures in the idempotency store, so a retry after a provider error can never succeed
