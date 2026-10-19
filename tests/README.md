# zk_invoice Test Suite

- **v3**：`test_zk_invoice_v3_0.leo` 针对 `zk_invoice_v3_0.aleo`（Wave 3）。当前 Leo 3.4 下 `leo test` 可能因解释器问题无法跑通，可用 **`tests/inputs/v3/run_manual.sh`** 在项目根做一键手动验证。

## What’s Covered
- **create_invoice**: happy path, min/max amount, buyer/seller guards, nonce uniqueness.
- **verify_invoice**: hash match / mismatch.
- **mark_as_paid**: buyer-only, duplicate/unauthorized attempts.
- **create_seller_receipt**: parity with buyer receipt.
- **cancel_invoice**: seller-only, and disallow cancel after paid.
- **commitments / rules caches**: anchors present and consistent.
- **audit authorization**: set_audit_authorization success/guards.
- **End-to-end lifecycle**: create → verify → pay → receipt → verify payment.

## Layout
```
tests/
├── README.md                    # You are here
├── test_zk_invoice_v3_0.leo     # v3 测试套件（当前 leo test 可能无法跑通，保留作用例文档）
├── inputs/v3/
│   ├── README.md                # v3 手动验证说明与命令行示例
│   └── run_manual.sh            # 一键跑 create/cancel/pay 等（推荐）
├── QUICK_REFERENCE.md
├── TESTING_GUIDE.md
├── AUDIT_FLOW_TESTING.md
└── validate_audit_package.mjs
```

## How to Run

### 推荐：v3 一键手动验证
```bash
# 在项目根执行
./tests/inputs/v3/run_manual.sh
```
详见 `tests/inputs/v3/README.md`。

### 可选：Leo 测试（若当前 Leo 版本支持）
```bash
leo test -p test_zk_invoice_v3_0
```

## Test Data (defaults used in examples)
```
SELLER: aleo1qqqq...3ljyzc
BUYER : aleo1qqqq...k9svjc
AMOUNT: 1000000u64
TAX   : 100000u64  (10%)
DUE   : 1735689600u32   # 2025-01-01 00:00:00 UTC
HASH  : 123456789field
NONCE : 99999field
PAYMENT_NONCE: 88888field
STATUS: 0=PENDING, 1=PAID, 2=CANCELLED, 3=EXPIRED
```

## Expected Failures to Watch For
- Seller == buyer on create → `assert_neq`.
- Amount = 0 → `assert`.
- Tax amount mismatches rules (R1/R3/R4) → `assert_eq`.
- Mark-as-paid by non-buyer or repeat → `assert_eq`.
- Cancel by non-seller or cancel paid → `assert_eq`.
- set_audit_authorization by non-seller or expired → `assert_eq`.

## Tips
- Records are UTXO-style: each use consumes the record; always use the freshest output.
- Keep CLI outputs; paste records carefully when chaining steps.
- Types must match signatures (u64/u32/field/address).

## Audit Package Utilities
- UI flow: see `tests/AUDIT_FLOW_TESTING.md`.
- Offline validation: `node tests/validate_audit_package.mjs <package.json> <audit_key_hex>`.
