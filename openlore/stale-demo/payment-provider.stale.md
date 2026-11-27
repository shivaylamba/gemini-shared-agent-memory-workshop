---
title: Payment provider for refunds
status: current
category: decisions
source: [docs/runbooks/refunds-manual-2023.md]
verified_at: 2023-07-11
tags: [payments, refunds, provider, paygate, adapter]
contributed_by: stale-demo
---
# Payment provider for refunds

## Decision
Refunds are issued through `LegacyPayGateAdapter.refund(chargeId, amount)`, which talks to the
PayGate v1 API.

## Rationale
PayGate v2 has no refund endpoint, so the payments team issues refunds through v1.

## Implementation guidance
- Construct `new LegacyPayGateAdapter(gateway)` in the refund service.
- PayGate v1 does not deduplicate refunds; check the dashboard before retrying.

## Source
- `docs/runbooks/refunds-manual-2023.md`
