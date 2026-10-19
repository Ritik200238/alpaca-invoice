# ZK-Invoice Business Flow Diagrams

## Overview

This document describes the complete business logic flows for the ZK-Invoice system, covering invoice creation, payment processing, cancellation, and audit workflows.

## Audit Authorization & Selective Disclosure (v2.2)

- **Audit package generation**: Requires wallet `signMessage`. If the invoice is chain-synced without a nonce, generation switches to chain-anchored mode and needs `commitment_root` on chain; otherwise it fails early.
- **On-chain authorization**: `set_audit_authorization` is seller-only and requires an **unspent** invoice record; spent records (paid/cancelled) will be rejected by the wallet/contract.
- **Scopes bitmask**: fields 1–9 map to amount, tax_amount, due_date, buyer, seller, currency, items_hash, memo_hash, order_id.
- **Verification (five phases)**: expiry/decrypt → invoice_hash vs registry → audit authorization (hash + scopes) → anchors (invoice_hash, commitment_root, rules_result, field_commitments) → rules R1–R5 recompute and compare.

## 1. Invoice Creation Flow

### High-Level Flow

```
┌─────────────┐
│   Seller    │
└──────┬──────┘
       │
       │ 1. Connect Wallet
       ▼
┌─────────────────────┐
│  Dashboard Page     │
└──────┬──────────────┘
       │
       │ 2. Click "Create Invoice"
       ▼
┌─────────────────────┐
│ Create Invoice Page │
└──────┬──────────────┘
       │
       │ 3. Fill Form:
       │    - Buyer Address
       │    - Amount (credits)
       │    - Description
       │    - Due Date
       ▼
┌─────────────────────┐
│  Submit Transaction │
└──────┬──────────────┘
       │
       │ 4. Generate Invoice Hash
       │    hash = BHP256(details)
       ▼
┌─────────────────────┐
│ Call create_invoice │
│  on zk_invoice_v3_1.aleo │
└──────┬──────────────┘
       │
       │ 5. ZK Proof Generation
       │    & Blockchain Submit
       ▼
┌─────────────────────────────────┐
│  Blockchain Returns 2 Records:  │
│  - Seller InvoiceRecord         │
│  - Buyer InvoiceRecord          │
└──────┬──────────────────────────┘
       │
       │ 6. Store in localStorage
       ▼
┌─────────────────────┐
│   Update UI         │
│   Show Success      │
└─────────────────────┘
       │
       │ 7. Buyer Receives Notification
       │    (off-chain communication)
       ▼
┌─────────────┐
│    Buyer    │
└─────────────┘
```

### Detailed State Diagram

```
                    ┌───────────┐
                    │   START   │
                    └─────┬─────┘
                          │
                          ▼
                ┌─────────────────────┐
                │  Wallet Connected?  │
                └─────┬─────────┬─────┘
                  NO  │         │  YES
              ┌───────┘         └────────┐
              ▼                           ▼
     ┌──────────────────┐      ┌──────────────────┐
     │ Show "Connect    │      │ Validate Seller  │
     │ Wallet" Prompt   │      │ Has Address      │
     └────────┬─────────┘      └────────┬─────────┘
              │                          │
              │ User Connects            │
              └──────────────────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │  Display Invoice Form  │
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │  Seller Fills Form:    │
              │  - Buyer Address       │
              │  - Amount              │
              │  - Description         │
              │  - Due Date            │
              └───────────┬────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │  Frontend Validation   │
              └───────┬──────────┬─────┘
                 FAIL │          │ PASS
              ┌───────┘          └────────┐
              ▼                            ▼
     ┌──────────────────┐      ┌─────────────────────┐
     │ Show Error       │      │ Build Invoice Data: │
     │ - Invalid address│      │ - invoiceNumber     │
     │ - Amount <= 0    │      │ - lineItems         │
     │ - Invalid date   │      │ - subtotal          │
     └──────────────────┘      │ - total             │
                                └──────────┬──────────┘
                                           │
                                           ▼
                               ┌────────────────────────┐
                               │ Generate Invoice Hash  │
                               │ hash = BHP256(details) │
                               └──────────┬─────────────┘
                                          │
                                          ▼
                               ┌────────────────────────┐
                               │ Convert amount to      │
                               │ microcredits           │
                               │ (multiply by 1,000,000)│
                               └──────────┬─────────────┘
                                          │
                                          ▼
                               ┌────────────────────────┐
                               │ Generate unique nonce  │
                               │ nonce = random field   │
                               └──────────┬─────────────┘
                                          │
                                          ▼
                               ┌────────────────────────┐
                               │ Call Leo Transition:   │
                               │ create_invoice(        │
                               │   buyer,               │
                               │   amount,              │
                               │   due_date,            │
                               │   invoice_hash,        │
                               │   nonce                │
                               │ )                      │
                               └──────────┬─────────────┘
                                          │
                          ┌───────────────┴───────────────┐
                          │   Aleo Network Processing     │
                          │   - Generate ZK Proof         │
                          │   - Validate Inputs           │
                          │   - Execute Transition        │
                          │   - Mine Block                │
                          └───────────────┬───────────────┘
                                          │
                        ┌─────────────────┴─────────────────┐
                    FAIL│                                   │SUCCESS
                        ▼                                   ▼
           ┌────────────────────────┐         ┌────────────────────────┐
           │ Transaction Failed     │         │ Transaction Success    │
           │ - Show error message   │         │ - Get transaction ID   │
           │ - Allow retry          │         │ - Receive 2 Records:   │
           └────────────────────────┘         │   * Seller Record      │
                                              │   * Buyer Record       │
                                              └──────────┬─────────────┘
                                                         │
                                                         ▼
                                             ┌────────────────────────┐
                                             │ Store Records in       │
                                             │ localStorage:          │
                                             │ - invoiceId            │
                                             │ - seller               │
                                             │ - buyer                │
                                             │ - amount               │
                                             │ - status = PENDING     │
                                             │ - dueDate              │
                                             │ - invoiceHash          │
                                             │ - createdAt            │
                                             └──────────┬─────────────┘
                                                        │
                                                        ▼
                                             ┌────────────────────────┐
                                             │ Update Zustand Store   │
                                             │ - Add to sentInvoices  │
                                             └──────────┬─────────────┘
                                                        │
                                                        ▼
                                             ┌────────────────────────┐
                                             │ UI Updates:            │
                                             │ - Show success message │
                                             │ - Display invoice ID   │
                                             │ - Show transaction ID  │
                                             │ - Redirect to invoice  │
                                             │   details page         │
                                             └────────────────────────┘
                                                        │
                                                        ▼
                                                 ┌────────────┐
                                                 │    END     │
                                                 └────────────┘
```

## 2. Payment Flow

### Complete Payment Process

```
┌─────────────┐
│   Buyer     │
└──────┬──────┘
       │
       │ 1. View Received Invoice
       ▼
┌─────────────────────┐
│ Invoice Detail Page │
│ Status: PENDING     │
└──────┬──────────────┘
       │
       │ 2. Verify Invoice Details
       │    - Amount correct?
       │    - Seller identity?
       │    - Due date valid?
       ▼
┌─────────────────────┐
│ Optional: Call      │
│ verify_invoice()    │
│ to check hash       │
└──────┬──────────────┘
       │
       │ 3. Click "Pay" Button
       ▼
┌─────────────────────────────────────┐
│ STEP 1: Private Transfer            │
│                                     │
│ Call credits.aleo/transfer_private: │
│ - Input: buyer's credit record      │
│ - Output: new credit record         │
│ - Recipient: seller address         │
│ - Amount: invoice amount            │
└──────┬──────────────────────────────┘
       │
       │ 4. Get Transfer Result
       │    - Transaction ID
       │    - Payment Nonce
       ▼
┌─────────────────────────────────────┐
│ STEP 2: Mark as Paid                │
│                                     │
│ Call zk_invoice_v3_1.aleo/mark_as_paid:  │
│ - Input: InvoiceRecord              │
│ - Input: payment_nonce              │
└──────┬──────────────────────────────┘
       │
       │ 5. Contract Validation
       │    - Caller = buyer?
       │    - Status = PENDING?
       │    - Amount matches?
       ▼
┌─────────────────────────────────────┐
│ Generate PaymentRecord:             │
│ - payment_id (hash)                 │
│ - invoice_id                        │
│ - payer (buyer)                     │
│ - payee (seller)                    │
│ - amount                            │
│ - payment_nonce                     │
│ - paid_at (timestamp)               │
└──────┬──────────────────────────────┘
       │
       │ 6. Return Records
       ▼
┌─────────────────────────────────────┐
│ Outputs:                            │
│ 1. PaymentRecord (for buyer)        │
│ 2. Updated InvoiceRecord            │
│    (status = PAID)                  │
└──────┬──────────────────────────────┘
       │
       │ 7. Store in localStorage
       ▼
┌─────────────────────┐
│ Update UI:          │
│ - Invoice: PAID     │
│ - Show Receipt      │
│ - Hide Pay button   │
└─────────────────────┘
       │
       │ 8. Seller notification
       │    (off-chain)
       ▼
┌─────────────┐
│   Seller    │
│ Views Paid  │
│ Invoice     │
└─────────────┘
```

### Payment State Machine

```
    ┌──────────────┐
    │   PENDING    │ ◄─── Initial state after invoice creation
    └──────┬───────┘
           │
           │ Buyer clicks "Pay"
           │
           ▼
    ┌──────────────────────┐
    │ TRANSFERRING CREDITS │ ◄─── Step 1: credits.aleo/transfer_private
    └──────┬───────┬────────┘
           │       │
      FAIL │       │ SUCCESS
           │       │
           │       ▼
           │  ┌─────────────────┐
           │  │ MARKING AS PAID │ ◄─── Step 2: mark_as_paid()
           │  └────┬───────┬────┘
           │       │       │
           │  FAIL │       │ SUCCESS
           │       │       │
           ▼       ▼       ▼
    ┌──────────────────────────┐
    │      PENDING              │ ◄─── Retry or manual intervention
    │  (with transfer complete, │       needed
    │   but marking failed)     │
    └───────────────────────────┘
                                │
                                ▼
                         ┌─────────────┐
                         │    PAID     │ ◄─── Final success state
                         └─────────────┘
```

### Error Handling Flow

```
Payment Initiation
       │
       ▼
┌──────────────────────┐
│ Check Prerequisites  │
└──────┬───────┬───────┘
  FAIL │       │ PASS
       │       │
       ▼       ▼
 ┌─────────────────────────────────────────┐
 │ ERROR: Missing Prerequisites            │
 │ - Buyer not connected?                  │
 │   → Show "Connect Wallet"               │
 │ - Insufficient credits?                 │
 │   → Show "Insufficient Balance"         │
 │ - Invoice not PENDING?                  │
 │   → Show "Already Paid/Cancelled"       │
 │ - Wrong buyer address?                  │
 │   → Show "Not Authorized"               │
 └─────────────────────────────────────────┘
                │
                │ Pre-checks pass
                ▼
       ┌─────────────────┐
       │ Step 1: Transfer│
       └────┬────────┬────┘
       FAIL │        │ SUCCESS
            │        │
            ▼        ▼
   ┌─────────────────────────────┐
   │ ERROR: Transfer Failed      │
   │ - Network error?            │
   │   → Retry after delay       │
   │ - Insufficient gas?         │
   │   → Request more credits    │
   │ - Invalid recipient?        │
   │   → Check seller address    │
   │ - Record not found?         │
   │   → Re-sync wallet          │
   └─────────────────────────────┘
                │
                │ Transfer succeeds
                │ Got payment_nonce
                ▼
       ┌──────────────────┐
       │ Step 2: Mark Paid│
       └────┬────────┬─────┘
       FAIL │        │ SUCCESS
            │        │
            ▼        ▼
   ┌─────────────────────────────┐
   │ ERROR: Marking Failed       │
   │ - Invoice already paid?     │
   │   → Verify on-chain state   │
   │ - Wrong invoice record?     │
   │   → Check invoice ID        │
   │ - Payment nonce mismatch?   │
   │   → Verify transfer TX      │
   │                             │
   │ CRITICAL: Credits already   │
   │ transferred but marking     │
   │ failed. Need manual         │
   │ intervention or retry.      │
   └─────────────────────────────┘
                │
                │ Both steps succeed
                ▼
       ┌──────────────────┐
       │   PAYMENT DONE   │
       │   - Update UI    │
       │   - Store receipt│
       │   - Notify user  │
       └──────────────────┘
```

## 3. Invoice Cancellation Flow

```
┌─────────────┐
│   Seller    │
└──────┬──────┘
       │
       │ 1. View Sent Invoice
       │    Status: PENDING
       ▼
┌─────────────────────┐
│ Invoice Detail Page │
└──────┬──────────────┘
       │
       │ 2. Click "Cancel"
       ▼
┌─────────────────────┐
│ Confirm Cancellation│
└──────┬──────────────┘
       │
       │ 3. User confirms
       ▼
┌──────────────────────────────────┐
│ Call cancel_invoice():            │
│ - Input: InvoiceRecord            │
│                                   │
│ Validations:                      │
│ - Caller = seller? ✓              │
│ - Status = PENDING? ✓             │
└──────┬───────────────────────────┘
       │
       │ 4. Generate new record
       ▼
┌──────────────────────────────────┐
│ Return Updated InvoiceRecord:     │
│ - Same invoice_id                 │
│ - Status = CANCELLED              │
│ - All other fields unchanged      │
└──────┬───────────────────────────┘
       │
       │ 5. Store updated record
       ▼
┌─────────────────────┐
│ Update UI:          │
│ - Status: CANCELLED │
│ - Hide Pay button   │
│ - Hide Cancel button│
└─────────────────────┘
       │
       │ 6. Buyer sees cancelled
       │    status on their side
       ▼
┌─────────────┐
│   Buyer     │
└─────────────┘
```

### Cancellation Rules

```
┌────────────────────────────────────────┐
│ Can Cancel?                            │
│                                        │
│ IF status == PENDING:                  │
│   AND caller == seller:                │
│     → YES, allow cancellation          │
│                                        │
│ IF status == PAID:                     │
│   → NO, invoice already paid           │
│                                        │
│ IF status == CANCELLED:                │
│   → NO, already cancelled              │
│                                        │
│ IF status == EXPIRED:                  │
│   → NO, invoice expired                │
│                                        │
│ IF caller == buyer:                    │
│   → NO, only seller can cancel         │
└────────────────────────────────────────┘
```

## 4. Invoice Verification Flow

```
┌─────────────┐
│  Any User   │ ◄─── Buyer, Seller, or Third Party
└──────┬──────┘
       │
       │ 1. Has InvoiceRecord
       ▼
┌─────────────────────┐
│ Original Invoice    │
│ Details (off-chain) │
└──────┬──────────────┘
       │
       │ 2. Re-compute hash
       │    expected_hash = BHP256(details)
       ▼
┌──────────────────────────────────┐
│ Call verify_invoice():            │
│ - Input: InvoiceRecord            │
│ - Input: expected_hash            │
│                                   │
│ Contract checks:                  │
│ invoice.invoice_hash == expected  │
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────────────┐
│ Return: boolean      │
│ - true = match ✓     │
│ - false = mismatch ✗ │
└──────┬───────────────┘
       │
       ▼
┌─────────────────────┐
│ Display Result:     │
│ ✓ "Invoice Valid"   │
│ ✗ "Invoice Altered" │
└─────────────────────┘
```

## 5. Seller Receipt Generation Flow

```
┌─────────────┐
│   Seller    │
└──────┬──────┘
       │
       │ 1. After payment received
       ▼
┌─────────────────────────────────────┐
│ Seller knows:                       │
│ - invoice_id                        │
│ - payer (buyer address)             │
│ - payee (seller address)            │
│ - amount                            │
│ - payment_nonce (from buyer's TX)   │
└──────┬──────────────────────────────┘
       │
       │ 2. Call create_seller_receipt()
       ▼
┌─────────────────────────────────────┐
│ Generate PaymentRecord:             │
│ - payment_id = hash(data)           │
│ - invoice_id                        │
│ - payer                             │
│ - payee                             │
│ - amount                            │
│ - payment_nonce                     │
│ - paid_at (current timestamp)       │
│ - owner = seller                    │
└──────┬──────────────────────────────┘
       │
       │ 3. Return PaymentRecord
       ▼
┌─────────────────────┐
│ Seller Receipt      │
│ - Proof of payment  │
│ - For accounting    │
└─────────────────────┘
```

## 6. Payment Verification Flow

```
┌─────────────┐
│  Any User   │
└──────┬──────┘
       │
       │ Has PaymentRecord + InvoiceRecord
       ▼
┌──────────────────────────────────┐
│ Call verify_payment():            │
│ - Input: PaymentRecord            │
│ - Input: InvoiceRecord            │
│                                   │
│ Contract checks:                  │
│ 1. payment.invoice_id ==          │
│    invoice.invoice_id             │
│ 2. payment.payer == invoice.buyer │
│ 3. payment.payee == invoice.seller│
│ 4. payment.amount == invoice.amount│
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────────────┐
│ Return: boolean      │
│ - true = valid ✓     │
│ - false = mismatch ✗ │
└──────┬───────────────┘
       │
       ▼
┌─────────────────────────┐
│ Use case:               │
│ - Accounting audit      │
│ - Dispute resolution    │
│ - Compliance check      │
└─────────────────────────┘
```

## 7. Audit Flow (Off-chain Selective Disclosure)

### Generation (Owner)
- Actor: Invoice owner (seller or buyer) with wallet connected and masterKey available.
- Steps:
  1. Open **Audit Center** → choose invoice ID, auditor address, expiry, permissions.
  2. Wallet signs an audit message (`signMessage`); app generates a **random 32-byte audit key**.
  3. Filter invoice data by permissions → AES-GCM encrypt with audit key → bundle **AuditPackage JSON** (includes cipher hash, permissions, expiry, signerAddress, signature).
  4. Owner shares **{AuditPackage JSON, audit key}** off-chain with the auditor.
  - Scope: one invoice per package (generate multiple packages if needed).

### Validation (Auditor)
- Inputs: AuditPackage JSON + audit key.
- Paths:
  - UI: Audit Center → “Validate Audit Package”.
  - CLI: `node tests/validate_audit_package.mjs <package.json> <audit_key_hex>`.
- Checks performed:
  - Expiry not passed.
  - Cipher hash matches payload.
  - Decrypt with provided audit key.
  - Recompute `invoice_hash` from disclosed details and compare with package value.
- Result: If valid, auditor sees only the permitted fields; no on-chain state is modified.

## 8. Unified Auto-Polling Flow (Chain Confirmation)

### Architecture: Global Singleton with Single Source of Truth

```
┌─────────────────────────────────────────────────────────────┐
│            InvoiceStore (Single Source of Truth)            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ sendingInvoiceHashes: Record<AleoField, true>          │ │
│  │ - All SENDING invoices tracked here                    │ │
│  │ - Updated by all invoice mutations                     │ │
│  │ - Subscribed by all pages + AutoPoller                 │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Zustand Subscribe
                            ▼
┌─────────────────────────────────────────────────────────────┐
│         InvoiceAutoPoller (Global Singleton Component)      │
│         Placed in app/(app)/layout.tsx                      │
└─────────────────────────────────────────────────────────────┘

    ┌────────────────────────┐
    │ useEffect watches:     │
    │ sendingInvoiceHashes   │
    └──────┬─────────────────┘
           │ Detect changes
           ▼
    ┌─────────────────────────┐
    │ New hash added?         │
    │ (not in pollingHashesRef│
    └──────┬──────────────────┘
           │ YES
           ▼
    ┌─────────────────────────┐
    │ Start polling for hash  │
    │ - useInvoiceListPolling │
    │ - Create PollingService │
    │ - 15s interval          │
    │ - 10min timeout         │
    └──────┬──────────────────┘
           │
    ┌──────┴───────┐
    │              │
    ▼              ▼
┌──────────┐  ┌──────────┐
│ Success  │  │ Timeout  │
└────┬─────┘  └────┬─────┘
     │             │
     ▼             ▼
┌─────────────────────────┐
│ markInvoiceConfirmed()  │
│ - Remove from index     │
│ - Update invoice        │
└─────────────────────────┘
           │
           ▼
┌─────────────────────────┐
│ UI auto-updates         │
│ (all pages subscribed)  │
└─────────────────────────┘
```

### User Operation Triggers Polling (Immediate)

```
┌─────────────────────────────────────────────────────────────┐
│              Any Page: User clicks Pay/Cancel               │
└─────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │ handlePay() or│
    │ handleCancel()│
    └──────┬───────┘
           │
           ▼
    ┌──────────────────────────┐
    │ Execute transaction      │
    │ - executePay()           │
    │ - executeCancel()        │
    └──────┬───────────────────┘
           │ Transaction submitted
           ▼
    ┌──────────────────────────┐
    │ Update invoice metadata: │
    │ - confirmationStatus =   │
    │   'SENDING'              │
    │ - action = 'pay'/'cancel'│
    └──────┬───────────────────┘
           │
           ▼
    ┌──────────────────────────┐
    │ markInvoiceSending(hash) │ ◄─── Immediate update
    │ - Add to global index    │
    │ - Triggers Zustand event │
    └──────┬───────────────────┘
           │
           │ < 1ms
           ▼
    ┌──────────────────────────┐
    │ AutoPoller detects       │
    │ - useEffect triggered    │
    │ - New hash in index      │
    └──────┬───────────────────┘
           │
           ▼
    ┌──────────────────────────┐
    │ Start polling            │
    │ immediately              │
    └──────┬───────────────────┘
           │
           ▼
    ┌──────────────────────────┐
    │ UI updates immediately   │
    │ - Dashboard: "Syncing" +1│
    │ - List: "Sending" badge  │
    │ - Detail: "Syncing..."   │
    └──────────────────────────┘
           │
           │ Every 15s
           ▼
    ┌──────────────────────────┐
    │ Scan chain for record    │
    └──────┬───────────────────┘
           │ Found
           ▼
    ┌──────────────────────────┐
    │ markInvoiceConfirmed()   │
    │ - Remove from index      │
    └──────┬───────────────────┘
           │
           ▼
    ┌──────────────────────────┐
    │ UI updates immediately   │
    │ - Dashboard: "Syncing" -1│
    │ - List: "Confirmed" badge│
    │ - Detail: Hide "Syncing" │
    └──────────────────────────┘
```

### Cross-Page Real-Time Synchronization

```
Scenario: User cancels invoice on List Page

┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│ List Page   │       │   Store     │       │Detail Page  │
└──────┬──────┘       └──────┬──────┘       └──────┬──────┘
       │                     │                     │
       │ handleCancel()      │                     │
       ├────────────────────►│                     │
       │                     │                     │
       │              markInvoiceSending()         │
       │              sendingHashes[hash]=true     │
       │                     ├────────────────────►│
       │                     │                     │
       │                     │              isSyncing = true
       │                     │              (Zustand subscribe)
       │                     │                     │
       │              AutoPoller detects           │
       │              Starts polling               │
       │                     │                     │
       │ "Sending" badge     │              "Syncing records..."
       │ shown               │              shown immediately
       │                     │                     │
       │              (15s later - record found)   │
       │                     │                     │
       │              markInvoiceConfirmed()       │
       │              sendingHashes[hash]=deleted  │
       │                     ├────────────────────►│
       │                     │                     │
       │ "Confirmed" badge   │              "Confirmed" shown
       │ shown               │              Hide "Syncing"
       │                     │                     │
```

## 9. Record Synchronization Flow

### When User Switches Wallets

```
┌─────────────────┐
│ User Action:    │
│ Switch Wallet   │
└──────┬──────────┘
       │
       ▼
┌─────────────────────────────────┐
│ Detect Wallet Change            │
│ (WalletWatcher component)       │
└──────┬──────────────────────────┘
       │
       │ New address detected
       ▼
┌─────────────────────────────────┐
│ Clear Current State:            │
│ - Clear sentInvoices            │
│ - Clear receivedInvoices        │
│ - Clear paymentReceipts         │
│ - Stop all polling              │
└──────┬──────────────────────────┘
       │
       │ Fetch for new address
       ▼
┌─────────────────────────────────┐
│ Load from IndexedDB:            │
│ - Filter by new address         │
│ - Restore sent invoices         │
│ - Restore received invoices     │
│ - Restart polling for SENDING   │
└──────┬──────────────────────────┘
       │
       │ Update UI
       ▼
┌─────────────────────┐
│ Dashboard Refreshed │
└─────────────────────┘
```

### Manual Sync

```
┌─────────────────┐
│ User Action:    │
│ Click "Sync"    │
└──────┬──────────┘
       │
       ▼
┌─────────────────────────────────┐
│ Scan blockchain for records:    │
│ - Use scanAndBuildInvoices()    │
│ - Scan InvoiceRecords           │
│ - Scan PaymentRecords           │
│ - Merge and deduplicate         │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ Update local state:             │
│ - Update invoices in store      │
│ - Update metadata to CONFIRMED  │
│ - Refresh chainStatusMap        │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ UI reflects latest state        │
└─────────────────────────────────┘
```

## 10. Status Lifecycle

### Complete Invoice Status Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    INVOICE LIFECYCLE                        │
└─────────────────────────────────────────────────────────────┘

    ┌──────────────────┐
    │    Created       │ ◄─── create_invoice()
    │  status=PENDING  │
    └────────┬─────────┘
             │
       ┌─────┴─────┐
       │           │
       │           │
       ▼           ▼
┌────────────┐  ┌────────────┐
│  PAYMENT   │  │ CANCELLED  │ ◄─── cancel_invoice()
│  mark_paid │  │  (seller)  │      (only seller)
└─────┬──────┘  └────────────┘
      │               │
      │               │
      ▼               │
┌────────────┐        │
│   PAID     │        │
│  (final)   │        │
└────────────┘        │
      │               │
      │               │
      └───────┬───────┘
              │
              ▼
       ┌────────────┐
       │  EXPIRED   │ ◄─── Time-based (frontend check)
       │ (overdue)  │      current_time > due_date
       └────────────┘
              │
              │
              ▼
          [ END ]

Status Transitions:
- PENDING → PAID (via mark_as_paid, buyer only)
- PENDING → CANCELLED (via cancel_invoice, seller only)
- PENDING → EXPIRED (time-based, no transaction)
- PAID → (no transitions, final state)
- CANCELLED → (no transitions, final state)
- EXPIRED → (no transitions, final state)
```

## 11. Role-Based Action Matrix

```
┌──────────────────┬──────────┬──────────┬───────────┐
│ Action           │  Seller  │  Buyer   │  Auditor  │
├──────────────────┼──────────┼──────────┼───────────┤
│ Create Invoice   │    ✓     │    ✗     │     ✗     │
│ View Invoice     │    ✓     │    ✓     │     ✓*    │
│ Cancel Invoice   │    ✓     │    ✗     │     ✗     │
│ Pay Invoice      │    ✗     │    ✓     │     ✗     │
│ Mark as Paid     │    ✗     │    ✓     │     ✗     │
│ Generate Receipt │    ✓     │    ✗     │     ✗     │
│ Verify Invoice   │    ✓     │    ✓     │     ✓*    │
│ Verify Payment   │    ✓     │    ✓     │     ✓*    │
│ Generate Audit   │    ✓     │    ✓     │     ✗     │
│ Modify Invoice   │    ✗     │    ✗     │     ✗     │
└──────────────────┴──────────┴──────────┴───────────┘

* Auditor: Only with valid audit key and within scope
```

## 12. Error Scenarios

### Common Error Flows

```
1. INSUFFICIENT CREDITS
   User → Attempts Payment → Check Balance → FAIL
   ↓
   Show Error: "Insufficient credits to pay invoice"
   ↓
   Actions: Top up wallet, Use different wallet

2. WRONG ROLE
   Buyer → Attempts Cancel → Check Role → FAIL
   ↓
   Show Error: "Only seller can cancel invoice"
   ↓
   Actions: Contact seller, Wait for payment

3. INVALID STATUS
   User → Attempts Pay Paid Invoice → Check Status → FAIL
   ↓
   Show Error: "Invoice already paid"
   ↓
   Actions: View receipt, Check transaction history

4. NETWORK ERROR
   User → Submits Transaction → Network Timeout → FAIL
   ↓
   Show Error: "Network error, please retry"
   ↓
   Actions: Retry, Check network connection

5. EXPIRED INVOICE
   User → Attempts Pay → Check Due Date → EXPIRED
   ↓
   Show Warning: "Invoice is past due date"
   ↓
   Actions: Contact seller, Request new invoice
```

## Summary

This document covers all major business flows in the ZK-Invoice system:

1. **Invoice Creation** - Seller creates invoice, buyer receives notification
2. **Payment Processing** - Two-step payment flow with credit transfer and status update
3. **Invoice Cancellation** - Seller-only cancellation before payment
4. **Verification** - Hash-based invoice verification for integrity
5. **Receipt Generation** - Seller creates receipt for accounting
6. **Payment Verification** - Match payment to invoice for auditing
7. **Audit Access** - Time-bound, scoped access for auditors
8. **Auto-Polling** - Automatic chain confirmation tracking for SENDING invoices
9. **Record Sync** - Wallet switch and manual synchronization
10. **Status Lifecycle** - State transitions and finality rules
11. **Role Permissions** - Action matrix by role
12. **Error Handling** - Common error scenarios and resolutions

All flows prioritize privacy through zero-knowledge proofs while maintaining transparency for authorized parties through audit mechanisms.

**Key Feature**: The system now includes automatic polling for SENDING invoices on list/dashboard pages, providing real-time feedback on transaction confirmation status without requiring manual intervention.
