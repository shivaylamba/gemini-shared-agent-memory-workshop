import { validationError } from '../utils/errors.ts';

/** Ensures a request body is a plain JSON object and returns it. */
export function requireJsonObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationError('Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}
