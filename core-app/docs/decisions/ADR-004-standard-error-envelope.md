# ADR-004: Standard error envelope

- Status: Accepted
- Date: 2024-05-02

## Decision

All error responses have exactly this shape:

```json
{ "error": { "code": "<CATALOGUE_CODE>", "message": "<human readable>", "details": { } } }
```

- Codes and HTTP statuses live in `ERROR_CATALOGUE` (`src/utils/errors.ts`). Add new codes there;
  never invent ad-hoc codes or statuses in handlers.
- Handlers and services throw `AppError(code, message, details?)`. The `errorHandler` middleware,
  registered once on the router, turns it into the envelope. Handlers never build error bodies by hand.
- Unexpected exceptions become `500 INTERNAL_ERROR` without stack traces.
- Provider failures become `502 PAYMENT_PROVIDER_ERROR`. `providerFailure()` in
  `payment-service.ts` does the conversion.
