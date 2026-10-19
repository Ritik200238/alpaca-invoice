# Inkan architecture

Inkan is private B2B invoicing on Midnight. An invoice's terms stay with the two parties; the
chain holds commitments to them and enforces the rules.

## Layers

```
Next.js application (screens, controllers, stores)
        │  controllers call services through interfaces
        ▼
Services (wallet, chain reads, crypto, audit, storage, polling)
        │
        ▼
Midnight
  inkan contract (Compact)       one contract: invoices, payment, audit authorization
  public indexer                 reads ledger state
  local proof server             builds proofs; it sees private data, so it stays local
```

## Where data lives

| Data | Where |
|---|---|
| Amount, tax, total, due date, currency, line items, memo, order reference, tax groups, payout addresses | the parties' own machines (private state), supplied to circuits as witnesses |
| Invoice identifier, status, party keys, commitments, rule digest, tax tag, registration digest, arbiter, audit authorization | the public ledger |
| Encrypted invoice details for the counterparty | the off-chain store behind `/api/invoice-details`, encrypted before it leaves the browser |

## The contract

| Circuit | Who | What it does |
|---|---|---|
| `createInvoice` | seller | checks the terms (amount bounds, total, due date, Japanese tax groups), records the invoice hash, eleven per-field commitments and their root, the rule digest, tax tag, registration digest and arbiter |
| `payInvoiceShielded` | buyer | proves the terms open the recorded commitment, then receives the buyer's shielded coin and forwards it to the seller in the same call; records a settlement anchor |
| `cancelInvoice` | seller | cancels a pending invoice |
| `setAuditAuthorization` | seller | records a hash of the audit key, the disclosed fields and the expiry |

Identity is a key derived from a secret the user holds, never the wallet's own address. Every
time a caller claims is bounded to within an hour of the block.

## Audit

The seller builds an encrypted package holding the chosen fields and their salts, and shares it
with the auditor with the audit key. The auditor decrypts it, recomputes each disclosed field's
commitment, and checks it against the commitments the chain has held since the invoice was
created. Each field has its own salt, so a disclosed field gives no help guessing the others.

The contract's own documentation, including every design decision and its reason, is in
`contracts/midnight/inkan/README.md`.
