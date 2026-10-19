# zk_invoice_v3_1.aleo Testing Guide (Step-by-Step)

This guide walks through preparation, core tests, negatives, and workflow checks for the current Leo contract (Wave2).

## Table of Contents
1. Environment setup
2. Core functional tests
3. Full lifecycle test
4. Boundary tests
5. Negative (expected-fail) tests
6. Security sanity checks
7. Useful tips

---

## 1) Environment Setup
```bash
# Install Leo (if missing)
curl -L https://raw.githubusercontent.com/AleoHQ/leo/testnet3/install.sh | sh
leo --version

# Build once
cd /Users/moose_ou/Alapaca-Inovice
leo build
```

Create two test accounts (seller / buyer) if you need fresh addresses:
```bash
leo account new   # save Private Key + Address
```

---

## 2) Core Functional Tests

### create_invoice
```bash
leo run create_invoice <buyer_addr>
  1000000u64 100000u64 1735689600u32 123456789field 99999field
  1700000000u32 0field 840field 11111field 0field
  1000000u64 1100000u64 1000u64
```
Expect: two `InvoiceRecord`s (seller & buyer) with same `invoice_id`, status = 0 (PENDING).

### verify_invoice
```bash
leo run verify_invoice "{seller_record}" 123456789field      # true
leo run verify_invoice "{seller_record}" 987654321field      # false
```

### mark_as_paid
```bash
leo run mark_as_paid "{buyer_invoice_record}" 88888field 1700000000u32
```
Expect: `PaymentRecord` + updated `InvoiceRecord` (status=1, PAID).

### create_seller_receipt
```bash
leo run create_seller_receipt <invoice_id> <buyer> <seller> 1000000u64 88888field
```
Expect: seller-owned `PaymentRecord` whose `payment_id` matches buyer receipt (same nonce).

### cancel_invoice
```bash
leo run cancel_invoice "{seller_invoice_record}"
```
Expect: returned record with status=2 (CANCELLED); other fields unchanged.

### verify_payment
```bash
leo run verify_payment "{payment_record}" "{invoice_record}"
```
Expect: true when invoice_id, amount, and parties match.

### set_audit_authorization
```bash
leo run set_audit_authorization "{invoice_record}" <audit_key_hash_field> <scopes_bitmask_u64> <expires_at_u32> <current_time_u32>
```
Expect: auth mapping set for the invoice_id; issuer must be seller and record must be unspent.

---

## 3) Full Lifecycle (Happy Path)
```bash
# 1) Create
leo run create_invoice <buyer>
  1000000u64 100000u64 1735689600u32 123456789field 99999field
  1700000000u32 0field 840field 11111field 0field
  1000000u64 1100000u64 1000u64
# capture seller_record, buyer_record

# 2) Verify hash
leo run verify_invoice "{buyer_record}" 123456789field

# 3) Pay
leo run mark_as_paid "{buyer_record}" 88888field 1700000000u32
# capture payment_record, updated_invoice

# 4) Seller receipt
leo run create_seller_receipt <invoice_id> <buyer> <seller> 1000000u64 88888field

# 5) Verify payment
leo run verify_payment "{payment_record}" "{updated_invoice}"

# 6) (optional) Set audit authorization
leo run set_audit_authorization "{buyer_record}" <audit_key_hash_field> 31u64 <expires_at_u32> <current_time_u32>
```

---

## 4) Boundary Tests
- Minimum amount: `1u64`
- Maximum amount: `18446744073709551615u64`
- Different nonces / buyers produce unique `invoice_id`
- Payment nonce changes `payment_id`
- Tax/line_items_sum/expected_total must satisfy rules R1–R4

---

## 5) Negative (Expected-Fail) Tests
| Scenario | Command sketch | Expected |
|----------|----------------|----------|
| seller == buyer | `leo run create_invoice {caller==buyer} ...` | assert_neq |
| amount = 0 | `leo run create_invoice <buyer> 0u64 ...` | assert |
| tax or totals mismatch | wrong tax/line_items_sum/expected_total | assert |
| mark as paid by non-buyer | run as seller | assert_eq |
| mark paid twice | reuse paid invoice | assert_eq |
| cancel by non-seller | run as buyer | assert_eq |
| cancel after paid | cancel a paid invoice | assert_eq |
| audit auth by non-seller | set_audit_authorization as buyer | assert_eq |

---

## 6) Security Sanity Checks
- Recompute hashes: identical inputs → identical `invoice_id` / `payment_id`; parameter drift should break equality.
- UTXO awareness: records are consumed once; always use fresh outputs between steps.
- Party checks: payer must equal invoice.buyer; canceller must equal invoice.seller.

---

## 7) Useful Tips
- Use `leo run --verbose ...` for more detail.
- Save CLI outputs to files to avoid copy/paste errors.
- Ensure argument order matches transition signatures (address, u64, u32, field, field).
- Keep separate terminal sessions or env vars for seller/buyer keys when switching roles.

---

## Related Docs
- `tests/QUICK_REFERENCE.md` — one-page command cheatsheet.
- `tests/AUDIT_FLOW_TESTING.md` — UI + CLI validation of audit packages (off-chain selective disclosure).
- Root `README.md` — project overview and audit workflow summary.
