import type { Paise } from '../utils/money.ts';

/**
 * Order lifecycle:
 *   pending -> paid -> partially_refunded -> refunded
 *                  \-----------------------> refunded
 * See ADR-005 for refund accounting rules.
 */
export type OrderStatus = 'pending' | 'paid' | 'partially_refunded' | 'refunded';

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  /** Total charged amount in integer paise (ADR-001). */
  amount: Paise;
  /** Sum of successful refunds in integer paise (ADR-005). */
  refundedAmount: Paise;
  /** Provider charge id, set once the order has been paid. */
  chargeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderView {
  id: string;
  customerId: string;
  status: OrderStatus;
  currency: 'INR';
  amount: Paise;
  refundedAmount: Paise;
  refundableAmount: Paise;
  createdAt: string;
  updatedAt: string;
}

export function refundableAmountOf(order: Order): Paise {
  if (order.status !== 'paid' && order.status !== 'partially_refunded') return 0;
  return order.amount - order.refundedAmount;
}

export function toOrderView(order: Order): OrderView {
  return {
    id: order.id,
    customerId: order.customerId,
    status: order.status,
    currency: 'INR',
    amount: order.amount,
    refundedAmount: order.refundedAmount,
    refundableAmount: refundableAmountOf(order),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
