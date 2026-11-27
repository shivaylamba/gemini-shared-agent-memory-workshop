# ADR-001: Represent money as integer paise

- Status: Accepted
- Date: 2023-02-06

## Context

Early prototypes stored rupees as JavaScript numbers (`499.99`). Floating-point arithmetic produced
off-by-one-paisa errors in partial refunds and in settlement reports.

## Decision

Every monetary amount is an integer number of paise (`1 INR = 100 paise`), typed as `Paise` in
`src/utils/money.ts`. This holds in the domain model, in API requests and responses, and in calls to
the payment provider.

- Client-supplied amounts are validated with `parsePositivePaise()`, which rejects fractions,
  zero, negatives and non-numbers with `VALIDATION_FAILED`.
- Conversion to rupees is only allowed for display (`formatInr`) and for reading legacy v1 reports.

## Consequences

- API consumers send `15000` for ₹150.00.
- Any adapter that needs rupees (PayGate v1) is a smell. See ADR-002.
