import type { LegacyPayGateAdapter } from '../integrations/legacy-paygate-adapter.ts';

/**
 * Historical settlement reconciliation for orders paid before the v2 migration.
 * This is the only remaining user of LegacyPayGateAdapter (deprecated, ADR-002).
 * New payment or refund flows must not follow this pattern.
 */
export interface LegacySettlement {
  transactionId: string;
  refundedRupees: number;
}

export function describeLegacyAdapter(adapter: LegacyPayGateAdapter): string {
  return `${adapter.name} (read-only reconciliation; deprecated)`;
}

export function totalLegacyRefundsInPaise(settlements: LegacySettlement[]): number {
  // v1 reports rupees; convert once at the boundary (ADR-001).
  return settlements.reduce((sum, settlement) => sum + Math.round(settlement.refundedRupees * 100), 0);
}
