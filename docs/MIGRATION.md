# Migration Note (Wave3 → v3_1)

Scope: keep only `zk_invoice_v3_1.aleo` active for new invoices; legacy programs remain read-only.

## What changed
- Program ID: `zk_invoice_v3_1.aleo` (testnet) — tx `at1kf9tl2vmd84398qrpzdrmtfkw2jdt4revyjlv2hmv5efg6rnegzqp3a0yp`
- New anchors: commitments, field commitments, rules_result, audit_authorization, audit_counter.
- New asserts: rules/commitment/amount/ownership/audit_counter.
- Audit packages: version 2.2 with scopes bitmask and chain-verifiable anchors.

## Environment
- `.env` / Vercel: `NEXT_PUBLIC_PROGRAM_ID=zk_invoice_v3_1.aleo`
- Keep `NEXT_PUBLIC_LEGACY_PROGRAM_ID` only if you must query old invoices; new UX focuses on v2_2.

## Rollback
- Switch env back to legacy program ID and redeploy frontend.
- Contract state is immutable; legacy invoices stay on their original program.

## Legacy handling
- UI shows full features for v2_2 invoices.
- Legacy invoices (no anchors) are treated as read-only; no audit features (fallback intentionally not implemented for Wave2 scope).
