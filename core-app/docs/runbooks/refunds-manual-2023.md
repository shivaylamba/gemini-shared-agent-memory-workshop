# Runbook: issuing a manual refund

_Owner: payments on-call · Last updated: 2023-07-11_

Use this when a customer support ticket asks for a refund that cannot wait for the next release.

1. Find the order and its PayGate transaction id in the admin console.
2. Convert the amount to rupees. PayGate expects rupees, for example `150.00`.
3. Call the adapter from a maintenance script:

   ```ts
   const adapter = new LegacyPayGateAdapter(gateway);
   await adapter.refund(order.chargeId, amountInPaise); // the adapter converts to rupees
   ```

4. If PayGate times out, check the PayGate dashboard before retrying. PayGate does not deduplicate
   refunds, so a blind retry can refund twice.
5. Update the order total in the database by hand and add a note to the ticket.

There is no refund endpoint in the API yet.
