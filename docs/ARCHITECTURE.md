# Alpaca Invoice - Technical Architecture

## 1. Architecture Overview

Alpaca Invoice is a privacy-preserving B2B invoice system built on the Aleo blockchain. The frontend adopts a **4-layer decoupled architecture** to separate privacy data management from UI rendering, achieving deep decoupling between business logic and the Aleo protocol.

### 1.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              View Layer                                  │
│   React components for UI rendering and user interaction                 │
│   (Dashboard, Invoice List, Invoice Detail, Receipts, Audit Center)     │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ User interaction / State display
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Controller Layer                               │
│   Custom Hooks orchestrating business logic                              │
│   (useWalletController, useInvoiceDetail, useTransactionController)     │
└──────────────────┬──────────────────────────────────┬───────────────────┘
                   │ Coordinate operations             │ Read/Update state
                   ▼                                   ▼
┌─────────────────────────────────┐   ┌───────────────────────────────────┐
│         Service Layer           │   │           Model Layer              │
│  Protocol adapters & utilities  │   │    Zustand Stores + IndexedDB     │
│  (Wallet, Crypto, Storage, RPC) │   │    (User, Invoice, Transaction)   │
└─────────────────────────────────┘   └───────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Aleo Blockchain                                  │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                 zk_invoice_v3_1.aleo Program                    │   │
│   │  Transitions: create_invoice, mark_as_paid, cancel_invoice,     │   │
│   │               set_audit_authorization, assert_* anchors         │   │
│   │  + ZK proofs (tax/range/ownership), mappings, async finalize     │   │
│   │  Records: InvoiceRecord, PaymentRecord, AuditReport (opt)        │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    credits.aleo Program                          │   │
│   │  transfer_private (for payment transfers)                        │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Layer Responsibilities

| Layer | Responsibility | Key Characteristics |
|-------|---------------|---------------------|
| **View** | UI rendering, user interaction | Pure React components, no business logic |
| **Controller** | Business logic orchestration | Custom Hooks, state derivation, flow control |
| **Service** | Protocol adaptation, heavy operations | Wallet interaction, encryption, RPC communication |
| **Model** | Global state management | Zustand stores, IndexedDB persistence |

---

## 2. Layer Details

### 2.1 View Layer

**Responsibility**: UI rendering, user interaction, and display of derived business states.

**Core Characteristics**:
- Pure React components without business logic
- Interacts only with Controller layer
- Does not directly read Store or call Aleo SDK

**Page Structure**:
```
app/
├── page.tsx                    # Landing page
├── layout.tsx                  # Root layout with sidebar
├── dashboard/page.tsx          # Dashboard with statistics
├── invoices/
│   ├── page.tsx               # Invoice list with filtering
│   ├── create/page.tsx        # Create invoice form
│   └── [id]/page.tsx          # Invoice detail view
├── receipts/page.tsx          # Payment receipts
└── audit/page.tsx             # Audit Center (generate + validate audit packages)
```

### 2.2 Controller Layer

**Responsibility**: System's "command center". Receives View instructions, coordinates Service operations, and updates Model based on results.

**Core Functions**:
1. **State Derivation**: Derive business semantics from raw Records (e.g., `isPaid`, `canCancel`)
2. **Flow Control**: Manage async transaction lifecycle (Pending → Mining → Confirmed)
3. **Error Handling**: Capture Service errors and transform to user-friendly messages

**Module Responsibilities**:

| Hook | Responsibility |
|------|---------------|
| `useWalletController` | Wallet connection, balance polling, identity authorization |
| `useAuthCheck` | Independent authorization check, reusable across pages |
| `useInvoices` | Invoice list compositor (initialize, filter, role, categorization) |
| `useInvoiceDetail` | Invoice detail compositor (data, role, manual sync, actions) |
| `useTransactionController` | Transaction flow management (create/pay/cancel/set_audit_authorization) |
| `useAuditPackageGenerate` | Generate audit package (envelope + auditKey) + submit on-chain authorization |
| `useAuditPackageDecrypt` | Decrypt audit package (envelope + key → payload) |
| `useAuditPackageVerify` | Verify audit package (five-phase trustless verification) |
| `useInvoiceListPolling` | Batch polling manager (used by InvoiceAutoPoller) |
| `useInvoiceChainSync` | Manual chain sync and key migration (detail page only) |
| `useInvoicePollingCore` | Core polling logic shared by all polling operations |
| `useInvoiceChainScan` | Chain scanning and invoice building utilities |

**Components**:
| Component | Responsibility |
|-----------|---------------|
| `InvoiceAutoPoller` | Global singleton auto-poller (monitors `sendingInvoiceHashes`, triggers polling) |

### 2.3 Service Layer

**Responsibility**: All "heavy" and "low-level" operations. Adapter for Aleo protocol.

**Core Functions**:
1. **Wallet Interaction**: Wrap `requestRecords`, `requestTransaction`, `signMessage` (wallet-side ZK proof)
2. **Encryption**: AES-GCM encryption for invoice details; audit package encryption using random audit keys; SHA-256 hashing
3. **Unit Conversion**: Microcredits ↔ Credits precision handling
4. **RPC Communication**: Network communication with Aleo nodes
5. **Audit Packages (off-chain)**: Build permission-scoped payloads, sign with wallet, validate & decrypt with provided audit key

**Service Interfaces**:

| Service | Responsibility | Status |
|---------|---------------|--------|
| `IWalletService` | Connect wallet, get ViewKey, balance, sign, request transaction | Implemented |
| `ICryptoService` | Compute invoice hash, local encrypt/decrypt, Record parsing | Implemented |
| `IStorageService` | IndexedDB CRUD for data persistence | Implemented |
| `IPollingService` | Generic polling service for status tracking | Implemented |
| `IAleoProtocolService` | Node RPC interaction (broadcast, query Mapping) | Partial |
| AuditService | Off-chain audit package build/validate, permission filtering | Implemented |

### 2.4 Model Layer

**Responsibility**: System's data source, managing global state as "single source of truth".

**Core Components**:
1. **Zustand Stores**: Store synced Records and Mapping states
2. **IndexedDB**: Local persistence for decrypted invoice details

**Store Structure**:

| Store | Responsibility |
|-------|---------------|
| `useUserStore` | User identity, masterKey, public key |
| `useInvoiceStore` | Invoice index, CRUD operations |
| `useArchiveStore` | Decrypted details archive |
| `useTransactionStore` | Transaction progress and logs |
| `useErrorStore` | Error state management |

---

## 3. Data Flow

### 3.1 Invoice Creation Flow

```
User Input → Frontend Form → Controller
                                │
                                ▼
                    Compute Invoice Hash (SHA-256)
                                │
                                ▼
                    Request Transaction via Wallet
                    (Wallet generates ZK proof internally)
                                │
                                ▼
                    Broadcast to Aleo Network
                                │
                                ▼
                    Return 2 InvoiceRecords
                    (seller + buyer)
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
            Seller Record           Buyer Record
            (owner: seller)         (owner: buyer)
                    │                       │
                    └───────────┬───────────┘
                                ▼
                    Encrypt & Store in IndexedDB
                    (status: SENDING)
                                │
                                ▼
                    Poll until CONFIRMED
                                │
                                ▼
                    Update UI
```

### 3.2 Payment Flow (Two-Step)

```
Buyer Initiates Payment
        │
        ▼
Step 1: Scan InvoiceRecord from chain
        │
        ▼
Step 2: Transfer Credits
        │
        ▼
credits.aleo/transfer_private
        │
        ├─ Input: buyer's credit record
        ├─ Input: seller address
        ├─ Input: amount
        │
        ▼
Step 3: Mark as Paid
        │
        ▼
zk_invoice_v3_1.aleo/mark_as_paid
        │
        ├─ Input: InvoiceRecord
        ├─ Input: payment_nonce
        │
        ▼
Generate PaymentRecord
        │
        ▼
Return Updated InvoiceRecord + PaymentRecord
        │
        ▼
Update IndexedDB & UI
```

### 3.3 Audit Package Flow

```
Invoice Owner (wallet connected, invoice must be PENDING/unspent)
        │
        ▼
Select invoice + permissions (scopes) + expiry in /audit
        │
        ▼
Sign audit message with wallet (signMessage)
        │
        ▼
Random audit key (32-byte) → AES-GCM encrypt filtered invoice data
        │
        ▼
Bundle AuditPackage envelope JSON
  - audit_key_hash, scopes_bitmask, expires_at
  - encrypted ciphertext + iv + auth_tag
  - signerAddress, signature
        │
        ├─── Download envelope JSON (share off-chain with auditor)
        │
        └─── [Optional] Submit On-chain Authorization
                │
                ▼
        zk_invoice_v3_1.aleo/set_audit_authorization
          - Input: InvoiceRecord (must be unspent)
          - Input: audit_key_hash, scopes_bitmask, expires_at
                │
                ▼
        On-chain auth mapping updated (enables Phase 3 verification)
        │
        ▼
Auditor validates (UI: /audit/verify)
  Phase 1 — expiry, cipher hash, signature presence
  Phase 2 — invoice_hash matches on-chain registry
  Phase 3 — audit_authorization exists on-chain; key hash & scopes match
  Phase 4 — chain anchors present (field commitments, rules)
  Phase 5 — recompute field commitments & rules (R1–R5), compare to cache
```

### 3.4 Unified Polling Architecture

The system implements a **global singleton auto-polling strategy** with a single source of truth for SENDING invoice status:

```
┌──────────────────────────────────────────────────────────────────┐
│                  Unified Polling Architecture                     │
│                   (Single Source of Truth)                        │
└──────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────┐
                    │   InvoiceStore (Zustand) │
                    │  ┌────────────────────┐  │
                    │  │sendingInvoiceHashes│  │ ◄─── Single Source of Truth
                    │  │Record<hash, true>  │  │
                    │  └────────────────────┘  │
                    └────────┬──────────────────┘
                             │ Subscribe (Zustand)
                             ▼
                    ┌─────────────────────────┐
                    │  InvoiceAutoPoller      │ ◄─── Global Singleton
                    │  (in app layout)        │
                    │                         │
                    │  - Watches sending index│
                    │  - Auto-starts polling  │
                    │  - Updates on complete  │
                    └────────┬────────────────┘
                             │ Uses
                             ▼
                    ┌─────────────────────────┐
                    │ useInvoiceListPolling   │
                    │  - Manages batch polling│
                    │  - One service per hash │
                    └────────┬────────────────┘
                             │ Uses
                             ▼
                    ┌─────────────────────────┐
                    │ useInvoicePollingCore   │
                    │  - Scan chain           │
                    │  - Validate status      │
                    │  - Build updated invoice│
                    └─────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    Pages Subscribe to Store                       │
└──────────────────────────────────────────────────────────────────┘

Dashboard              List Page              Detail Page
┌────────────┐        ┌────────────┐        ┌─────────────┐
│useInvoices │        │useInvoices │        │useInvoice   │
│            │        │            │        │   Detail    │
│isSyncing = │        │isSyncing = │        │             │
│check global│        │check global│        │isSyncing =  │
│  index     │        │  index     │        │check global │
└────────────┘        └────────────┘        └─────────────┘
      │                     │                      │
      └─────────────────────┴──────────────────────┘
                            │
                            ▼
                  All read from same source
                  (sendingInvoiceHashes)
```

**Key Design Principles:**

1. **Single Source of Truth**: `sendingInvoiceHashes` in InvoiceStore is the only source for SENDING status
   - All pages derive `isSyncing` from this global index
   - Avoids state inconsistency across pages

2. **Global Auto-Poller**: `InvoiceAutoPoller` component in `app/(app)/layout.tsx`
   - Singleton instance for entire application
   - Automatically detects new SENDING invoices
   - Manages all polling services centrally
   - Survives navigation between pages

3. **Automatic State Updates**: All invoice mutations sync the index
   - `addInvoice` → Auto-updates sending index
   - `updateInvoice` → Auto-syncs SENDING/CONFIRMED
   - `markInvoiceSending` → Immediate index update (triggers AutoPoller)
   - `markInvoiceConfirmed` → Removes from index (stops polling)

4. **No Master Key Required for Polling**: 
   - Chain scanning works without master key
   - Updates invoice `confirmationStatus` in memory
   - Persistence only happens when master key available
   - Enables Dashboard to show real-time status without unlock

**Polling Flow:**

1. **User Operation** (create/pay/cancel invoice)
   → `executeCancel/executePay` updates invoice metadata to SENDING
   → `markInvoiceSending(hash)` adds to global index

2. **AutoPoller Detects Change**
   → Subscribes to `sendingInvoiceHashes` via Zustand
   → Detects new hash, calls `startPolling([hash])`

3. **Polling Execution**
   → `useInvoiceListPolling` creates PollingService for each hash
   → `useInvoicePollingCore` scans chain every 15s
   → Validates with `InvoiceStatusValidator`

4. **Confirmation**
   → Updates invoice with confirmed status
   → `markInvoiceConfirmed(hash)` removes from index
   → All subscribed pages re-render automatically

5. **UI Updates** (real-time across all pages)
   → Dashboard: "Syncing" card appears/disappears
   → List: Invoice shows "Sending" badge
   → Detail: "Syncing chain records..." text displays

**Benefits:**
- Cross-page consistency: Cancel on list page → Detail page shows syncing immediately
- Real-time dashboard stats: No need to refresh
- Simplified code: No manual polling management in pages
- Performance: Single polling instance per invoice (no duplicates)

### 3.5 Invoice Status Lifecycle

```
    ┌──────────────┐
    │   PENDING    │ ◄─── Initial state after creation
    └──────┬───────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
┌─────────┐  ┌───────────┐
│  PAID   │  │ CANCELLED │ (seller only)
└─────────┘  └───────────┘
     │           │
     └─────┬─────┘
           │
           ▼
    ┌───────────┐
    │  EXPIRED  │ (time-based check)
    └───────────┘
```

**Confirmation Status** (metadata):
- `SENDING`: Transaction submitted, awaiting chain confirmation
- `CONFIRMED`: Found matching record on chain, status validated

---

## 4. Smart Contract Design

### 4.1 Record Definitions

**InvoiceRecord**:
```leo
record InvoiceRecord {
    owner: address,
    invoice_id: field,
    seller: address,
    buyer: address,
    amount: u64,
    status: u8,          // 0=PENDING, 1=PAID, 2=CANCELLED, 3=EXPIRED
    due_date: u32,
    invoice_hash: field,
    created_at: u32
}
```

**PaymentRecord**:
```leo
record PaymentRecord {
    owner: address,
    payment_id: field,
    invoice_id: field,
    payer: address,
    payee: address,
    amount: u64,
    payment_nonce: field,
    paid_at: u32
}
```

### 4.2 Dual Record Design

`create_invoice` returns two identical InvoiceRecords (except owner field):
- One for seller (owner: seller_address)
- One for buyer (owner: buyer_address)

Both parties can independently manage their records.

### 4.3 Pure Record Architecture

**Design Choice**: All state stored in Records (UTXO-style), no global mappings.

**Reasons**:
- Testnet limitation: doesn't support async/finalize
- Privacy: records are private by default
- Simplicity: no state synchronization needed

---

## 5. Error Handling System

### 5.1 Error Flow

```
Service Layer (Technical Errors)
        │
        │ WalletServiceError / ProtocolServiceError
        ▼
Controller Layer (Capture & Transform)
        │
        │ toAppError()
        ▼
ErrorStore (State Management)
        │
        ▼
ErrorHandler (Toast Display)
        │
        ▼
User Interface
```

### 5.2 Error Types

**Service Layer** (Technical):
- `WalletServiceError`: NOT_INSTALLED, USER_REJECTED, INSUFFICIENT_FEE, etc.
- `ProtocolServiceError`: NODE_CONNECTION_FAILED, INVALID_RECORD, etc.

**UI Layer** (User-Friendly):
- WALLET_NOT_CONNECTED
- TRANSACTION_REJECTED
- INSUFFICIENT_BALANCE
- NETWORK_ERROR

---

## 6. Storage Strategy

### 6.1 Data Persistence

| Data Type | Persisted | Location | Reason |
|-----------|-----------|----------|--------|
| Basic Info (id, seller, buyer, amount) | Yes | IndexedDB | Source for unconfirmed invoices |
| Encrypted Details | Yes | IndexedDB | Sensitive data, needs encryption |
| Confirmation Status | No | Memory | Runtime state, fetched from chain |
| Chain Data | No | On-chain | Confirmed invoices more reliable from chain |

### 6.2 Encryption Scheme

- **Master Key**: PBKDF2 (100,000 iterations) derived from wallet `signMessage` (used to encrypt local invoice details in IndexedDB)
- **Audit Key**: Random 32-byte key generated per audit package; used to AES-GCM encrypt filtered disclosure payload
- **Integrity**: SHA-256 hash verification for invoice details (`invoice_hash`) and cipher-hash in audit packages

---

## 7. Technology Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Zustand** - Lightweight state management
- **IndexedDB (idb)** - Client-side persistence

### Blockchain
- **Leo 3.4.0** - Aleo smart contract language
- **@provablehq/sdk** - Aleo SDK
- **@demox-labs/aleo-wallet-adapter** - Wallet integration

### Wallets Supported
- Leo Wallet
- Puzzle Wallet

---

## 8. Deployment

### Contract
- **Program ID**: `zk_invoice_v3_1.aleo` (legacy ids kept only for historical reads)
- **Network**: Aleo Testnet
- **Deployment TX**: `at19wjr8krkxg33ykjmhunrufzrmk53n2r6qew9ynznu9mzldvmg5xqyayedc`

### Frontend
- **Platform**: Vercel
- **Environment Variables**:
  - `NEXT_PUBLIC_ALEO_NETWORK=testnet`
  - `NEXT_PUBLIC_ALEO_ADDRESS=your_address`

---

## 9. Version Information

- **Document Version**: 2.2 (on-chain audit authorization + five-phase verification)
- **Code Version**: 1.4
- **Last Updated**: February 2026
