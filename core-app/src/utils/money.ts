import { validationError } from './errors.ts';

/**
 * ADR-001: every monetary amount in ShopFlow is an integer number of paise
 * (1 INR = 100 paise). Never use floating-point rupees in domain code, APIs or
 * provider calls.
 */
export type Paise = number;

export const CURRENCY = 'INR';

export function isPaise(value: unknown): value is Paise {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Validates an amount supplied by a client. Rejects non-numbers, fractions,
 * negative values and zero with a VALIDATION_FAILED error.
 */
export function parsePositivePaise(value: unknown, field = 'amount'): Paise {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw validationError(`${field} must be a number of paise`, { field });
  }
  if (!Number.isSafeInteger(value)) {
    throw validationError(`${field} must be an integer number of paise`, { field });
  }
  if (value <= 0) {
    throw validationError(`${field} must be greater than zero`, { field });
  }
  return value;
}

export function formatInr(amount: Paise): string {
  const rupees = Math.trunc(amount / 100);
  const paise = Math.abs(amount % 100).toString().padStart(2, '0');
  return `₹${rupees.toLocaleString('en-IN')}.${paise}`;
}

/**
 * @deprecated Only for reading legacy (v1) provider reports, which use rupees.
 * Domain code must not convert to rupees (ADR-001).
 */
export function paiseToRupees(amount: Paise): number {
  return amount / 100;
}
