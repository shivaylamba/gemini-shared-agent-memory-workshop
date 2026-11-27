I have investigated the payment and refund architecture of ShopFlow and submitted concise Markdown knowledge documents covering:
1. **Payment and Refund Architecture** (`payment-and-refund-architecture`) - Detailing domain service coordination, persistence, idempotency, and provider interactions.
2. **Refund Accounting and Validation Rules** (`refund-accounting-and-validation-rules`) - Detailing ADR-005 rules regarding refundable order states, balance checks (`refundableAmountOf`), error codes (`ORDER_NOT_REFUNDABLE`, `REFUND_EXCEEDS_REFUNDABLE`), and ledger recording.
3. **Payment Provider Abstraction and Idempotency** (`payment-provider-abstraction-and-idempotency`) - Detailing `PaymentProvider` interface usage, `PayGateV2Adapter`, integer paise amounts, idempotency scoping, and safe retries.

### Files Relied On
- `src/payments/payment-service.ts`
- `src/refunds/refund-service.ts`
- `src/refunds/refund-routes.ts`
- `src/orders/order.ts`
- `src/integrations/payment-provider.ts`
- `src/integrations/paygate-v2-adapter.ts`
- `src/payments/transaction-ledger.ts`
- `docs/architecture/overview.md`
- `docs/architecture/api.md`
- `docs/decisions/ADR-001-integer-paise.md`
- `docs/decisions/ADR-002-paygate-v2-adapter.md`
- `docs/decisions/ADR-003-idempotent-requests.md`
- `docs/decisions/ADR-004-standard-error-envelope.md`
- `docs/decisions/ADR-005-refund-accounting.md`
