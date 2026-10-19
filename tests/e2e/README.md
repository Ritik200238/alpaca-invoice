# E2E Test Plan (manual)

Scope: zk_invoice_v3_1.aleo (testnet)

## Happy Path
1) Create invoice (seller)
   - Inputs: buyer address, amount, description, due date, enable audit auth (scopes: amount/buyer/seller, expiry +7d).
   - Expect: creation succeeds, status SENDING → CONFIRMED; audit anchors present; audit counter = +1.
2) Generate audit package (seller)
   - From `/audit`, select invoice, choose fields (amount/tax/buyer/seller), expiry +2d.
   - Expect: package JSON + audit key; rules_hash/commitments_root populated.
3) Verify audit package (auditor/offline)
   - Paste package + key; expect valid, asserts ok, R1–R5 pass.
4) Pay invoice (buyer)
   - Expect: status PAID; audit counter unchanged.
5) Verify audit package again
   - Still valid; chain status shows PAID.

## Negative Cases
1) Expired audit package
   - Manually set expires_at to past, expect validation fail (expired).
2) Wrong rules_hash
   - Tamper rules_hash, expect assertRules failure.
3) Unauthorized scopes
   - Generate package with scopes not in authorization; expect assert failure or UI reject (future).
4) Invalid commitment root
   - Tamper commitments_root, expect assertCommitment failure.

## Notes
- Use deployed program `zk_invoice_v3_1.aleo` testnet.
- Requires two wallet addresses for buyer/seller; can reuse same wallet for partial tests where role check allows.
