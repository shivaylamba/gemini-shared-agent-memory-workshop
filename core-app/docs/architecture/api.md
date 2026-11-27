# ShopFlow API

All amounts are integer paise (ADR-001). All errors use the envelope from ADR-004:

```json
{ "error": { "code": "ORDER_NOT_FOUND", "message": "Order ord_x was not found", "details": { "orderId": "ord_x" } } }
```

`details` is optional. Error codes and HTTP statuses come from `ERROR_CATALOGUE` in `src/utils/errors.ts`.

## GET /api/orders/:orderId

`200 OK`

```json
{
  "order": {
    "id": "ord_1001", "customerId": "cus_ananya", "status": "paid", "currency": "INR",
    "amount": 50000, "refundedAmount": 0, "refundableAmount": 50000,
    "createdAt": "…", "updatedAt": "…"
  }
}
```

Errors: `404 ORDER_NOT_FOUND`.

## POST /api/orders/:orderId/pay

Request: `{ "idempotencyKey": "pay-ord_1001-0001" }`

`201 Created`: `{ "transaction": { … }, "order": { … } }`

Errors: `400 VALIDATION_FAILED`, `404 ORDER_NOT_FOUND`, `409 ORDER_ALREADY_PAID`,
`409 IDEMPOTENCY_KEY_REUSED`, `502 PAYMENT_PROVIDER_ERROR`.

## POST /api/orders/:orderId/refund (planned)

Refunds part or all of a paid order.

Request:

```json
{ "amount": 15000, "idempotencyKey": "refund-request-001" }
```

`201 Created`:

```json
{
  "refund": {
    "id": "txn_0002", "orderId": "ord_1001", "amount": 15000, "status": "succeeded",
    "providerRefundId": "rf_0001", "idempotencyKey": "refund-request-001", "createdAt": "…"
  },
  "order": { "id": "ord_1001", "status": "partially_refunded", "refundedAmount": 15000, "refundableAmount": 35000, "…": "…" }
}
```

Errors:

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `amount` is not a positive integer, or `idempotencyKey` is missing or malformed |
| 404 | `ORDER_NOT_FOUND` | Unknown order |
| 409 | `ORDER_NOT_REFUNDABLE` | The order has not been paid |
| 409 | `IDEMPOTENCY_KEY_REUSED` | The key was already used with a different amount |
| 422 | `REFUND_EXCEEDS_REFUNDABLE` | `amount` is larger than `refundableAmount` |
| 502 | `PAYMENT_PROVIDER_ERROR` | PayGate rejected or failed the refund |

Replaying a request with the same `idempotencyKey` and body returns the original `201` response.
