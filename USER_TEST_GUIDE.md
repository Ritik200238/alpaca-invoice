# User Testing Guide (Frontend, Testnet, zk_invoice_v3_1.aleo)

Goal: Validate end-to-end flows as a user on Aleo testnet with the deployed program `zk_invoice_v3_1.aleo` (tx at1kf9tl2vmd84398qrpzdrmtfkw2jdt4revyjlv2hmv5efg6rnegzqp3a0yp).

## Prerequisites
- Two Aleo accounts (Seller, Buyer) in Leo Wallet or Puzzle Wallet on testnet.
- `.env` already points to `NEXT_PUBLIC_PROGRAM_ID=zk_invoice_v3_1.aleo`.
- Run app locally (`npm run dev`) or on your deployed testnet frontend.
 - For audit package generation from chain-synced invoices (no local nonce), the invoice must already have `commitment_root` on chain; otherwise generation will fail fast with “no commitment_root on chain”.

## Happy Path
1) **Create invoice (Seller)**
   - Go to `/invoice/create`.
   - Fill buyer address, amount, description, due date.
   - (Optional) Toggle “Enable audit authorization” to auto-call `set_audit_authorization` after creation; otherwise you can submit later from Audit Center.
   - Submit; wait for SENDING → CONFIRMED; invoice detail page shows commitments/rules/auth/counter.
2) **Generate audit package (Seller)**
   - Go to `/audit`, select the new invoice, pick fields (amount/tax/buyer/seller), expiry +2d.
   - Click **Generate**; if the invoice came from chain sync and lacks nonce but has `commitment_root` on chain, generation will use chain-anchored mode automatically.
   - Download envelope JSON + note the audit key.
3) **Submit on-chain authorization (Seller)**
   - In the same panel click **Submit On-chain Authorization**. Requires seller wallet and an **unspent** invoice record; if the record is spent (paid/cancelled), wallet will return “Unspent record not found”.
4) **Validate package (Auditor/anyone)**
   - Paste package JSON + audit key in `/audit` validator.
   - Expect “Valid package”, R1–R5 pass, anchors and asserts all green.
5) **Pay invoice (Buyer)**
   - Open `/invoices/[id]` as buyer; click Pay.
   - Status should become PAID; audit counter unchanged (only create/cancel affect count).
6) **Re-validate package**
   - Re-run validator; chain status should reflect PAID.

## Negative Checks
1) **Expired package**: Edit `expires_at` in JSON to a past value; validator should show `expired`.
2) **Tampered rules_hash**: Change `rules_hash` to another field string; expect assertRules failure.
3) **Tampered commitments_root**: Change `commitments_root`; expect assertCommitment failure.
4) **Unauthorized scopes**: If on-chain authorization was set with limited scopes, generate a package disclosing fields outside that bitmask; Phase 3 should fail.
5) **Chain-anchored missing root**: Try generating a package for a chain-synced invoice with no `commitment_root`; expect “Cannot generate chain-anchored audit package: no commitment_root on chain for this invoice_id.”

## What to record
- Tx hashes for create/pay (and cancel if tested).
- Screenshots of validator results (anchors + asserts) for valid and each negative case.
- Any unexpected errors.

## Notes
- Build warning about @provablehq wasm top-level await is expected on testnet; runtime not affected in supported browsers.
- Legacy invoices (pre-v2_2) are read-only and have no audit features.***
