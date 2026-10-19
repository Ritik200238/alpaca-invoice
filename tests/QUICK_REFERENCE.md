# Test Quick Reference (zk_invoice_v3_1.aleo)

One-page cheat sheet for the current Wave2 contract.

## Fast Path
```bash
leo build                  # compile
./run_tests.sh             # full suite (v2_2)
./run_tests.sh create_invoice   # feature-focused subset
```

## Core Commands

### create_invoice
```bash
leo run create_invoice <buyer>
  1000000u64 100000u64 1735689600u32 123456789field 99999field
  1700000000u32 0field 840field 11111field 0field
  1000000u64 1100000u64 1000u64
```

### verify_invoice
```bash
leo run verify_invoice "{invoice_record}" 123456789field      # expect true
leo run verify_invoice "{invoice_record}" 987654321field      # expect false
```

### mark_as_paid
```bash
leo run mark_as_paid "{buyer_invoice_record}" 88888field 1700000000u32
```

### create_seller_receipt
```bash
leo run create_seller_receipt 1234567890field <buyer> <seller> 1000000u64 88888field
```

### cancel_invoice
```bash
leo run cancel_invoice "{seller_invoice_record}"
```

### verify_payment
```bash
leo run verify_payment "{payment_record}" "{invoice_record}"
```

### set_audit_authorization
```bash
leo run set_audit_authorization "{invoice_record}" <audit_key_hash_field> <scopes_bitmask_u64> <expires_at_u32> <current_time_u32>
```

## End-to-End Happy Path
```bash
# 1) create invoice (with tax and commitments fields)
leo run create_invoice <buyer>
  1000000u64 100000u64 1735689600u32 123456789field 99999field
  1700000000u32 0field 840field 11111field 0field
  1000000u64 1100000u64 1000u64
# capture seller_record, buyer_record

# 2) verify hash
leo run verify_invoice "{buyer_record}" 123456789field

# 3) pay
leo run mark_as_paid "{buyer_record}" 88888field
# capture payment_record, updated_invoice

# 4) seller receipt
leo run create_seller_receipt <invoice_id> <buyer> <seller> 1000000u64 88888field

# 5) verify payment
leo run verify_payment "{payment_record}" "{updated_invoice}"

# 6) (optional) set audit authorization
leo run set_audit_authorization "{buyer_record}" <audit_key_hash_field> 31u64 <expires_at_u32> <current_time_u32>
```

## Should Fail (negative checks)
| Scenario | Command sketch | Expected |
|----------|----------------|----------|
| seller == buyer | `leo run create_invoice <caller> ...` | assert_neq |
| amount = 0 | `leo run create_invoice <buyer> 0u64 ...` | assert |
| tax or totals mismatch | wrong tax_amount/line_items_sum | assert |
| non-buyer marks paid | run as seller | assert_eq |
| mark paid twice | reuse paid invoice | assert_eq |
| non-seller cancel | run as buyer | assert_eq |
| cancel after paid | cancel paid invoice | assert_eq |
| audit auth by non-seller | run set_audit_authorization as buyer | assert_eq |

## Handy constants (examples)
```
SELLER: aleo1qqqq...3ljyzc
BUYER : aleo1qqqq...k9svjc
AMOUNT: 1000000u64
DUE   : 1735689600u32
HASH  : 123456789field
NONCE : 99999field
PAYMENT_NONCE: 88888field
```

## Utilities
- Offline audit package validator: `node tests/validate_audit_package.mjs <package.json> <audit_key_hex>`
- Verbose output: `leo run --verbose ...`
- Clean build: `leo clean`
