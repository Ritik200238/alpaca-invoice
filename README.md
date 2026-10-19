# Alpaca Invoice

**Invoices settle on-chain. Their terms never do.**

Private B2B invoicing with Japanese consumption-tax rules, shielded settlement and
selective audit. It began on Aleo and is being ported to [Midnight](https://midnight.network).
This branch holds the Midnight work; the Aleo product it came from is described further down.

## On Midnight: where it stands

| | |
|---|---|
| **Contract** | [`contracts/midnight/alpaca-invoice`](contracts/midnight/alpaca-invoice): 4 entry points (create, pay, cancel, audit authorization), compiled with Compact 0.31.1 with real proving and verifying keys for all four circuits |
| **Tests** | 88 in-process tests against the compiled contract: `npm test` in the contract folder |
| **Mutation sweep** | 45 of 45 mutants caught, plus one provably unreachable case that is named, not counted: `npm run test:mutation` |
| **On Midnight Preview** | contract `15efb99ca21bb255b0f12a1de56c0519d3f98e95c4e1e4f341aea8fa0f4ec2a8`. Four transactions, each `SUCCESS` on the public indexer and listed with explorer links in [`docs/receipts/preview.json`](docs/receipts/preview.json): the [deploy](https://explorer.1am.xyz/tx/bbaa1cd4869986b5ca192a72b96cb91f171de8398b4e814cd66df16041af00b3?network=preview) (block 1,364,749), [`createInvoice`](https://explorer.1am.xyz/tx/b3349368d698aebb226fc61ab17aee2a6a775bed3055eb89cf616b88e262eebe?network=preview) (1,365,672), `setAuditAuthorization` (1,365,677) and `cancelInvoice` (1,365,704). After each, the state was read back through the indexer and searched for the invoice figures; none appeared |
| **Not yet on Preview** | the payment. `payInvoiceShielded` is tested in process, but a payment moves a *shielded* coin and the funded wallet holds only unshielded NIGHT from the faucet. The wallet SDK would not shield it (`Insufficient funds`), and the run recorded that instead of skipping the step quietly |
| **Interface** | restyled (colours, font, corner radius; no layout or flow changes) and not yet connected to Midnight |
| **Not yet ported** | escrow, disputes, the stablecoin payment path, the credit proof. See the [contract README](contracts/midnight/alpaca-invoice/README.md) for what each becomes and why the credit proof is not a straight port |

The design, what the chain can and cannot see, every difference from the Aleo program and
why, and how to run it are in the [contract README](contracts/midnight/alpaca-invoice/README.md).
Midnight code is Apache-2.0 ([LICENSE](LICENSE), [NOTICE](NOTICE)).

---

# The original Aleo version

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

## Contributors

- Ritik Pandey
