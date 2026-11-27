import type { Order } from '../src/orders/order.ts';

const CREATED_AT = '2026-11-01T09:00:00.000Z';

/** Default demo data: unpaid orders that can be paid (and then refunded) through the API. */
export function seedOrders(): Order[] {
  return [
    { id: 'ord_1001', customerId: 'cus_ananya', status: 'pending', amount: 50_000, refundedAmount: 0, createdAt: CREATED_AT, updatedAt: CREATED_AT },
    { id: 'ord_1002', customerId: 'cus_rohan', status: 'pending', amount: 120_000, refundedAmount: 0, createdAt: CREATED_AT, updatedAt: CREATED_AT },
    { id: 'ord_1003', customerId: 'cus_meera', status: 'pending', amount: 9_999, refundedAmount: 0, createdAt: CREATED_AT, updatedAt: CREATED_AT },
    { id: 'ord_1004', customerId: 'cus_kabir', status: 'pending', amount: 75_050, refundedAmount: 0, createdAt: CREATED_AT, updatedAt: CREATED_AT },
  ];
}
