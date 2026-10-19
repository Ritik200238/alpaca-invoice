# Alpaca Invoice

Privacy-preserving B2B invoice system on Aleo. Private Records plus public anchors (hash, commitments, rules_result, audit auth/counter) enable selective, chain-verifiable audits.

**Current contract:** `zk_invoice_v3_1.aleo` (testnet) — tx `at1kf9tl2vmd84398qrpzdrmtfkw2jdt4revyjlv2hmv5efg6rnegzqp3a0yp`

## Features

- **Privacy-First**: Transaction amounts and party details encrypted on-chain
- **Private Payment**: Single-step `pay_invoice_credits_private` (credits.aleo transfer + invoice state + settlement commitment)
- **Dual Records**: Both seller and buyer receive independent invoice records
- **Audit Support**: Off-chain selective disclosure via wallet-signed audit packages (permissioned + expiring), on-chain audit authorization (set_audit_authorization), and shareable audit keys
- **Chain Anchors**: Commitments/rules caches on-chain enable chain-anchored packages when the local invoice nonce is missing (requires commitment_root to exist on chain)
- **IndexedDB Storage**: Encrypted local persistence with integrity verification

## Quick Start

### Prerequisites

- Node.js 18+
- Aleo Wallet (Leo Wallet or Puzzle Wallet)

### Installation

```bash
npm install
npm run dev
```

Visit http://localhost:3000

Optional utilities:
- Offline audit-package validator: `node tests/validate_audit_package.mjs <package.json> <audit_key_hex>`

### Configuration

Create `.env` file:

```env
NEXT_PUBLIC_ALEO_NETWORK=testnet
NEXT_PUBLIC_PROGRAM_ID=zk_invoice_v3_1.aleo
NEXT_PUBLIC_LEGACY_PROGRAM_ID=zk_invoice_v3_0.aleo
NEXT_PUBLIC_ALEO_ADDRESS=your_aleo_address
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 14)                     │
│  ┌────────────┐  ┌────────────┐  ┌───────────────────────┐  │
│  │    View    │  │ Controller │  │    Service Layer      │  │
│  │ Components │◄─┤   Hooks    │◄─┤ (Wallet, Crypto, RPC) │  │
│  └────────────┘  └────────────┘  └───────────────────────┘  │
│                         │                                    │
│  ┌──────────────────────▼────────────────────────────────┐  │
│  │              Model (Zustand + IndexedDB)               │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Aleo Blockchain (Testnet)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 zk_invoice_v3_1.aleo                  │  │
│  │  create_invoice | mark_as_paid | cancel_invoice       │  │
│  │  set_audit_authorization | assert_* anchors           │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   credits.aleo                         │  │
│  │  transfer_private (for payments)                       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Contract Functions

| Function | Role | Description |
|----------|------|-------------|
| `create_invoice` | Seller | Create invoice (async finalize writes hash/commitments/rules_result caches) |
| `pay_invoice_credits_private` | Buyer | Private credits transfer + invoice state update + settlement commitment |
| `pay_invoice_usdcx` | Buyer | Stablecoin payment path (enabled once USDCx program ID is provided) |
| `cancel_invoice` | Seller | Cancel pending invoice (async) |
| `set_audit_authorization` | Seller | Set audit_key_hash + scopes + expiry |
| `assert_rules_anchor` | Anyone | Assert cached rules_result |
| `assert_commitment_anchor` | Anyone | Assert commitment root |
| `assert_amount_anchor` | Anyone | Assert amount range vs record |
| `assert_ownership_anchor` | Anyone | Assert seller/buyer vs record |
| `assert_audit_counter_anchor` | Anyone | Assert seller audit counter |

## Project Structure

```
├── src/main.leo              # Smart contract
├── app/                      # Next.js pages
│   ├── dashboard/            # Dashboard
│   ├── invoices/             # Invoice management
│   ├── receipts/             # Payment receipts
│   └── audit/                # Audit Center (generate + validate audit packages)
├── components/               # React components
├── controller/               # Business logic hooks
├── services/                 # Protocol adapters
├── stores/                   # Zustand state management
└── docs/                     # Documentation
```

## Technology Stack

**Frontend**: Next.js 14, TypeScript, Tailwind CSS, Zustand, IndexedDB

**Blockchain**: Leo 3.4.0, @provablehq/sdk, @demox-labs/aleo-wallet-adapter

**Wallets**: Leo Wallet, Puzzle Wallet

## Audit Workflow (Selective Disclosure)
1. Connect a wallet that supports `signMessage`; ensure the invoice you want to disclose is decrypted locally (masterKey is derived during create/pay flows).
2. Open `/audit`, choose invoice ID, expiry, and permissions; click **Generate** to get an envelope-format audit package and audit key.  
   - If the invoice was synced from chain and has no nonce, generation uses chain-anchored mode and requires `commitment_root` on chain; otherwise it will fail fast with “no commitment_root on chain”.
3. (Recommended) Click **Submit On-chain Authorization** to call `set_audit_authorization` with the envelope’s `audit_key_hash` and scopes. Requires the seller wallet and an **unspent** invoice record.
4. Share the envelope JSON + audit key to the auditor (out-of-band).
5. Auditor validates via the UI validator or offline script: `node tests/validate_audit_package.mjs <envelope.json> <audit_key_hex>`. Verification runs five phases: expiry/decrypt → invoice_hash vs chain → audit authorization → anchors → rules.

## Testing

The project has two layers of tests:

**Smart Contract (Leo)** — Wave2 contract `zk_invoice_v3_1.aleo` with mappings/async/ZK proofs (rules, amount, ownership, commitments, audit auth/counter). Main suite: `tests/test_zk_invoice_v2_2.leo`.

**Service Unit Tests (Vitest)** — Unit tests for core services including WalletService, CryptoService, AleoProtocolService, StorageService, InvoiceStatusValidator, PollingService, and InvoiceStore. Run with `npx vitest`.

**Linting** — `npm run lint`

### Test Documentation

- `tests/README.md` — Leo test suite overview and how-to
- `tests/TESTING_GUIDE.md` — Step-by-step testing guide
- `tests/QUICK_REFERENCE.md` — Command cheatsheet
- `tests/AUDIT_FLOW_TESTING.md` — UI + CLI audit package validation
- `services/*/__tests__/README.md` — Per-service test docs

## Deployment

- **Program ID**: `zk_invoice_v3_1.aleo` (legacy IDs only for history reads)
- **Network**: Aleo Testnet Beta
- **Deployment TX**: `at1kf9tl2vmd84398qrpzdrmtfkw2jdt4revyjlv2hmv5efg6rnegzqp3a0yp`

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) - Technical architecture and data flows
- [Business Flow](./docs/BUSINESS_FLOW.md) - Complete business logic flows
- [Audit Package API](./docs/API_AUDIT_PACKAGE.md) - v2.2 schema, scopes bitmask, examples

## License

MIT
