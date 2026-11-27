import type { Paise } from '../utils/money.ts';

export type TransactionType = 'charge' | 'refund';

export interface Transaction {
  id: string;
  orderId: string;
  type: TransactionType;
  amount: Paise;
  provider: string;
  providerReference: string;
  idempotencyKey: string;
  createdAt: string;
}

/** Append-only audit ledger of successful provider transactions. */
export class TransactionLedger {
  private readonly entries: Transaction[] = [];
  private seq = 0;

  record(entry: Omit<Transaction, 'id'>): Transaction {
    const transaction: Transaction = { id: `txn_${String(++this.seq).padStart(4, '0')}`, ...entry };
    this.entries.push(transaction);
    return { ...transaction };
  }

  forOrder(orderId: string): Transaction[] {
    return this.entries.filter((entry) => entry.orderId === orderId).map((entry) => ({ ...entry }));
  }
}
