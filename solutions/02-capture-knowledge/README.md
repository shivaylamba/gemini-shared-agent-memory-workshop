# Solution 02: Teach an Agent to Remember

```bash
npm run solution -- 02      # lists and validates the reference notes
npm run checkpoint -- 02    # loads them into OpenLore
```

The reference notes are in
[`exercises/02-capture-knowledge/checkpoints/knowledge/`](../../exercises/02-capture-knowledge/checkpoints/knowledge).
They were written by the workshop authors, not by a model, and are marked `contributed_by: workshop-checkpoint`.

| Note | Captures |
|---|---|
| `architecture/application-overview.md` | Request flow, where conventions live, type-stripping rules |
| `decisions/money-representation.md` | Integer paise, `parsePositivePaise` |
| `decisions/payment-provider.md` | `createPaymentProvider()`; the legacy adapter and 2023 runbook are superseded |
| `decisions/refund-idempotency.md` | `IdempotencyStore.run`, refund scope, failures release the key |
| `runbooks/error-handling.md` | `AppError`, the catalogue, existing refund error codes |
| `runbooks/refund-workflow.md` | Refundable amount, status transitions, ledger, where to wire things |

What makes a good note: one topic; decision, rationale, guidance and sources; every `source` path
exists; no code dumps, transcripts or secrets; and `verified_at` so readers can judge freshness.
