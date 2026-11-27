import { AppError, isAppError, toErrorBody } from '../utils/errors.ts';
import type { Handler, Middleware } from '../utils/router.ts';

/**
 * ADR-004: converts every thrown error into the standard error envelope.
 * Handlers should throw AppError; they must not build error bodies themselves.
 * Unknown errors become INTERNAL_ERROR without leaking stack traces.
 */
export const errorHandler: Middleware = (next: Handler): Handler => {
  return async (request) => {
    try {
      return await next(request);
    } catch (error) {
      const appError = isAppError(error)
        ? error
        : new AppError('INTERNAL_ERROR', 'An unexpected error occurred');
      return { status: appError.status, body: toErrorBody(appError) };
    }
  };
};
