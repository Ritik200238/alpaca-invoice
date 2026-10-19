# Audit Flow Testing & Debugging Guide

This guide explains how to manually test and debug the selective-disclosure (audit package) feature end-to-end (envelope v2.2.0). It also ships a small helper script for offline validation.

## Prerequisites
- Node.js 18+ (for Next.js dev server and the helper script).
- An Aleo wallet that supports `signMessage` (Leo Wallet via demox adapter).
- At least one invoice **with details stored locally** (created from this app while connected to your wallet).

## Quick Manual Test (UI)
1. Start the app: `npm run dev` (or `pnpm dev`) and open http://localhost:3000.
2. Connect your Aleo wallet; ensure a master key has been derived (creating/paying an invoice does this).
3. Go to **/audit**.
4. **Generate package**
   - Enter an existing `invoiceId`, expiry date, and fields to disclose.
   - Click **Generate** → you should see an audit key (hex) and an envelope JSON.
   - If the invoice was synced from chain and lacks a nonce, generation will use chain-anchored mode; it will fail if `commitment_root` is missing on chain.
   - Click **Download JSON**.
5. **(Optional) Submit authorization**
   - Click **Submit On-chain Authorization**. Requires seller wallet and an unspent invoice record; spent records will make the wallet return “Unspent record not found”.

6. **Validate package**
   - Paste the downloaded JSON and the audit key into the **Validate Audit Package** panel.
   - Click **Validate**.
   - Expect “Valid package” and decrypted fields matching your selections; Phase 3 will be green only if on-chain authorization exists and scopes match.
6. Negative checks:
   - Change one character in the audit key or JSON → validation should fail.
   - Set the expiry date in the past → validation should fail.

## Offline Validator Script
Use the helper to validate a saved package without running the UI.

```
node tests/validate_audit_package.mjs /path/to/package.json <audit_key_hex>
```

What it does:
- Verifies expiry and cipher hash.
- Decrypts with the provided audit key.
- Recomputes `invoice_hash` from disclosed data and compares with package `invoiceHash`.
- Calls chain checks when reachable (invoice_hash, audit_authorization, anchors, rules).
- Prints PASS/FAIL plus decrypted payload.

## Debug Tips
- If generation fails with “Invoice details are missing”, re-open the invoice in the same session to ensure it is decrypted with your master key, then try again.
- If generation fails with “no commitment_root on chain”, the invoice was synced from chain without a nonce and the chain cache is empty; wait for anchors or re-create the invoice locally.
- Wallet must expose `signMessage`; if you see “Wallet does not support signMessage”, switch to Leo Wallet.
- If authorization submission fails with “Unspent record not found”, the invoice record is already spent (paid/cancelled); chain cannot accept new audit authorization for spent records.
