/**
 * Standard error catalogue and envelope for every ShopFlow API response.
 *
 * ADR-004: handlers never build error bodies by hand. They throw an AppError with
 * a code from this catalogue; the router turns it into
 *   { "error": { "code": "...", "message": "...", "details": { ... } } }
 * with the HTTP status listed below.
 */

export const ERROR_CATALOGUE = {
  VALIDATION_FAILED: { status: 400, description: 'Request body or parameters are invalid.' },
  ROUTE_NOT_FOUND: { status: 404, description: 'No route matches the method and path.' },
  ORDER_NOT_FOUND: { status: 404, description: 'The order does not exist.' },
  ORDER_ALREADY_PAID: { status: 409, description: 'The order has already been charged.' },
  ORDER_NOT_REFUNDABLE: { status: 409, description: 'The order has not been paid, so nothing can be refunded.' },
  IDEMPOTENCY_KEY_REUSED: { status: 409, description: 'The idempotency key was already used with a different request.' },
  REFUND_EXCEEDS_REFUNDABLE: { status: 422, description: 'The refund amount is larger than the remaining refundable amount.' },
  PAYMENT_PROVIDER_ERROR: { status: 502, description: 'The payment provider rejected or failed the request.' },
  INTERNAL_ERROR: { status: 500, description: 'Unexpected server error.' },
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOGUE;

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CATALOGUE[code].status;
    this.details = details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function toErrorBody(error: AppError): ErrorBody {
  const body: ErrorBody = { error: { code: error.code, message: error.message } };
  if (error.details && Object.keys(error.details).length > 0) {
    body.error.details = error.details;
  }
  return body;
}

export function validationError(message: string, details?: Record<string, unknown>): AppError {
  return new AppError('VALIDATION_FAILED', message, details);
}
