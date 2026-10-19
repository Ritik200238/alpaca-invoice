# Inkan business flows

## 1. Create an invoice

1. The seller fills in the invoice: line items, tax rates (10% standard, 8% reduced), due date,
   memo, order reference and the buyer.
2. The application computes the totals and the two tax groups, draws a fresh nonce, and keeps
   the terms in the seller's private state.
3. `createInvoice` checks the terms and records commitments to them. A qualified invoice is
   refused if a group's tax is not net times rate, or the groups do not add up to the total.
4. The encrypted details go to the buyer through the off-chain store.

Status: **pending**.

## 2. Pay

1. The buyer opens the invoice with the details the seller shared.
2. `payInvoiceShielded` proves the buyer holds the terms the chain committed to, then moves a
   shielded coin for exactly the total to the seller's payout address, inside the same
   transaction. The contract never holds the money.
3. A settlement anchor is recorded, so the buyer can later prove the payment to an auditor.

Status: **pending → paid**. A payment after the due date is refused.

## 3. Cancel

The seller cancels a pending invoice. A paid invoice cannot be cancelled.

Status: **pending → cancelled**.

## 4. Audit

1. The seller chooses the fields to disclose and an expiry, and records the authorization with
   `setAuditAuthorization` (only a hash of the audit key reaches the chain).
2. The seller gives the auditor the encrypted package and the audit key.
3. The auditor checks each disclosed field against the commitments on the chain.

## Statuses

| Status | Meaning |
|---|---|
| pending | created, not yet paid |
| paid | settled in full |
| cancelled | withdrawn by the seller before payment |
| escrowed, disputed, refunded, resolved | reserved for the escrow and dispute flows, not yet built |
