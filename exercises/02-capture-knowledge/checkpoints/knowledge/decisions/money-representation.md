---
title: Money is integer paise
status: current
category: decisions
source: [docs/decisions/ADR-001-integer-paise.md, src/utils/money.ts]
verified_at: 2026-11-27
tags: [money, paise, validation, payments, refunds]
contributed_by: workshop-checkpoint
---
# Money is integer paise

## Decision
Every amount (domain, API, provider calls) is an integer number of paise (`Paise` type,
1 INR = 100 paise). Rupee floats are never used.

## Rationale
Floating-point rupees produced off-by-one-paisa errors in partial refunds and settlements.

## Implementation guidance
- Validate client amounts with `parsePositivePaise(value, field)` from `src/utils/money.ts`. It
  rejects fractions, zero, negatives and non-numbers with `VALIDATION_FAILED` (HTTP 400).
- Do not convert to rupees except for display (`formatInr`).
- Example: `{ "amount": 15000 }` means ₹150.00.

## Source
- `docs/decisions/ADR-001-integer-paise.md`
- `src/utils/money.ts`
