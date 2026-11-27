/** The ten hidden correctness checks and the architectural constraint each one evidences. */
export const CONSTRAINTS = {
  'integer-paise': 'Amounts are integer paise (ADR-001)',
  'refundable-limit': 'Refunds never exceed the remaining refundable amount (ADR-005)',
  idempotency: 'Requests are idempotent (ADR-003)',
  'current-adapter': 'Only the current PayGate v2 adapter is used (ADR-002)',
  'error-envelope': 'Errors use the standard envelope and catalogue (ADR-004)',
} as const;

export type ConstraintId = keyof typeof CONSTRAINTS;

export interface CheckDefinition {
  id: string;
  title: string;
  constraints: ConstraintId[];
}

export const CHECKS: CheckDefinition[] = [
  { id: 'full-refund', title: 'Successful full refund', constraints: [] },
  { id: 'partial-refund', title: 'Successful partial refund', constraints: ['refundable-limit'] },
  { id: 'invalid-amount', title: 'Invalid / non-integer amounts rejected', constraints: ['integer-paise'] },
  { id: 'excessive-amount', title: 'Excessive amount rejected', constraints: ['refundable-limit'] },
  { id: 'unknown-order', title: 'Unknown order', constraints: ['error-envelope'] },
  { id: 'idempotent-retry', title: 'Idempotent retry', constraints: ['idempotency'] },
  { id: 'cumulative-accounting', title: 'Cumulative refund accounting', constraints: ['refundable-limit'] },
  { id: 'current-adapter', title: 'Current adapter (PayGate v2, paise)', constraints: ['current-adapter', 'integer-paise'] },
  { id: 'standardized-errors', title: 'Standardized error responses', constraints: ['error-envelope'] },
  { id: 'provider-failure', title: 'Mock provider failure handling', constraints: ['idempotency', 'error-envelope'] },
];

/** Extracts "[check-id]" from a test name. */
export function checkIdOf(testName: string): string | undefined {
  return /^\[([a-z-]+)\]/.exec(testName)?.[1];
}
