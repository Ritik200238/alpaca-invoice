# v3 输入文件 — 供 `leo run` 手动验证

## 一键跑通（推荐）

在**项目根目录**执行以下命令，会自动依次跑完整条 v3 流程并打印每步输出，便于观察：

```bash
./tests/inputs/v3/run_manual.sh
```

或：`bash tests/inputs/v3/run_manual.sh`。

**脚本步骤**（合约 **zk_invoice_v3_1.aleo**）：get_caller → compute_invoice_hash → make_jct_non_jct → **create_invoice #1** → **cancel_invoice**（用 #1 的 seller record）→ create_invoice #2（Credits）→ **pay_invoice_credits_private**（用 #2 的 buyer record + credits record）→ create_invoice #3（USDCx）→ **pay_invoice_usdcx**（用 #3 的 buyer record + token record + proofs）。

- 默认使用 `.env` 中的 `PRIVATE_KEY` 作为 seller（create / cancel 等）。
- **Buyer 地址**：若在 `.env` 中设置了 **`BUYER_PRIVATE_KEY`**，脚本会先用该密钥执行 `get_caller` 得到 buyer 地址，并以此地址作为所有 create_invoice 的 buyer；未设置则使用测试常量 `aleo1qqqq...3ljyzc` 作为 buyer，并跳过 Step 8 / Step 12。
- **Step 8（Credits 支付）**：需在 `.env` 中设置 **`CREDITS_RECORD`**（一行 `credits.aleo/credits` record），否则跳过。签名：`pay_invoice_credits_private(pay_record, invoice_record, payment_nonce, paid_at)`。
- **Step 12（USDCx 支付）**：需在 `.env` 中设置 **`TOKEN_RECORD`** 与 **`USDCX_PROOFS`**（test_usdcx 的 Token record 与 `[MerkleProof; 2]`），否则跳过。签名：`pay_invoice_usdcx(token_record, invoice_record, payment_nonce, paid_at, proofs)`，返回 7 个输出（seller_token, change_token, compliance_record, PaymentRecord, 2× InvoiceRecord, Future）。
- **若 Step 8/12 长时间无输出**：跨程序调用可能挂起。脚本在检测到 `timeout` 时会为这两步加 90 秒超时；macOS 可 `brew install coreutils` 使用 `timeout`。

---

## 重要说明：Leo 3.4 的 `leo run` 不自动读 .in 文件

在 **Leo 3.4** 下，`leo run <transition>` **只接受命令行参数**，不会从 `.in` 文件自动读入。  
因此需要把参数**按 transition 签名顺序**写在命令后面。当前合约为 **zk_invoice_v3_1.aleo**（Credits 私有支付 + USDCx 私有 transfer_private + 承诺审计）。

## 当前可行方式：用 .in 作参数清单 + 命令行传参

- **`inputs/zk_invoice_v3_1.in`** 或项目根下对应 v3 的 `.in`：按 `[transition名]` 区块整理各 transition 参数，用作**参考/复制来源**。
- 运行某 transition 时，从对应区块中按**参数顺序**把值抄到命令行。

### 示例：compute_invoice_hash（10 个参数）

顺序：`seller, buyer, amount, tax_amount, due_date, nonce, order_id, currency, items_hash, memo_hash`。  
**注意**：buyer 必须用 `aleo1qqqq...3ljyzc`（v3 TEST_BUYER）。`aleo1qqqq...k9svjc` 会被 Leo CLI 报 parse 错误，不要用。  
将下面的 `SELLER` 换成你 `leo run get_caller` 的输出后，在**项目根**执行：

```bash
leo run compute_invoice_hash \
  SELLER \
  aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc \
  1000000u64 100000u64 1735689600u32 99999field 0field 840field 11111field 0field
```

例如 seller 为 `aleo158ppqgwwvz4z8gcxg6la3j83t3zvw6uud09ck3vvp29c7ggh0qgqj93d4t` 时：

```bash
leo run compute_invoice_hash \
  aleo158ppqgwwvz4z8gcxg6la3j83t3zvw6uud09ck3vvp29c7ggh0qgqj93d4t \
  aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc \
  1000000u64 100000u64 1735689600u32 99999field 0field 840field 11111field 0field
```

### get_caller（无参数）

```bash
leo run get_caller
```

### compute_invoice_id（5 个参数：seller, buyer, amount, due_date, nonce）

将 `SELLER` 换成 `leo run get_caller` 输出；buyer 用 `3ljyzc`。

```bash
leo run compute_invoice_id \
  SELLER \
  aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc \
  1000000u64 1735689600u32 99999field
```

### make_jct_non_jct（2 个参数：total_amount, currency_flag）

```bash
leo run make_jct_non_jct 1100000u64 0u8
```

### compute_tax_tag_for_test（6 个参数：ga_rate_bps, ga_net_sum, ga_tax_sum, gb_rate_bps, gb_net_sum, gb_tax_sum）

JCT 用；得到 tax_tag 后填入下面的 make_jct_jct。

```bash
leo run compute_tax_tag_for_test 1000u64 1000000u64 100000u64 800u64 0u64 0u64
```

### make_jct_jct（10 个参数：ga_*, gb_*, tax_tag, total_amount, jct_reg, currency_flag）

`tax_tag` 用上一步输出；无 JCT 时可用 0field。

```bash
leo run make_jct_jct 1000u64 1000000u64 100000u64 800u64 0u64 0u64 0field 1100000u64 0field 0u8
```

### create_invoice（15 个参数）

顺序：buyer, amount, tax_amount, due_date, invoice_hash, nonce, current_time, order_id, currency, items_hash, memo_hash, line_items_sum, expected_total, tax_rate_bps, jct。  
`invoice_hash` 用 `leo run compute_invoice_hash ...` 输出；`jct` 用 `leo run make_jct_non_jct 1100000u64 0u8` 的输出（整段 struct）。将下面中的 `INVOICE_HASH`、`JCT_STRUCT` 替换后执行：

```bash
leo run create_invoice \
  aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc \
  1000000u64 100000u64 1735689600u32 \
  INVOICE_HASH \
  99999field 1700000000u32 0field 840field 11111field 0field \
  1000000u64 1100000u64 1000u64 \
  JCT_STRUCT
```

若 CLI 不接受 `JCT_STRUCT` 为多行，可先执行 `leo run make_jct_non_jct 1100000u64 0u8`，将输出的整段 `{ tax_groups: {...}, ... }` 复制为一行后替换上面的 `JCT_STRUCT`。

### get_invoice_tax_tag（1 个参数：invoice_id）

`INVOICE_ID` 从 create_invoice 返回的 seller record 中取。

```bash
leo run get_invoice_tax_tag INVOICE_ID
```

### get_invoice_jct_reg（1 个参数：invoice_id）

```bash
leo run get_invoice_jct_reg INVOICE_ID
```

### get_payment_commitment（2 个参数：invoice_id, commitment）

根据发票 ID 与支付承诺查询链上是否已写入。`invoice_id` 从 create_invoice 的 record 中取；`commitment` 从 pay 返回的 PaymentRecord 等得到。

```bash
leo run get_payment_commitment INVOICE_ID COMMITMENT
```

### 使用前必做

1. **seller**：用 `leo run get_caller` 输出替换上述命令中的 seller 地址。
2. **create_invoice**：先运行 `leo run compute_invoice_hash ...` 得到 `invoice_hash`，再拼 create_invoice 的 15 个参数（或从 `inputs/` 下对应 v3 的 `.in` 的 `[create_invoice]` 复制并替换 invoice_hash、jct）。
3. **getter**：invoice_id / commitment 从 create 或 pay 的输出中取得后传入。

### 推荐执行顺序

1. `leo run get_caller` → 记下地址，用作后续 seller。
2. `leo run compute_invoice_hash`（用上面示例，替换 SELLER）→ 记下输出的 field，用于 create_invoice 的 invoice_hash。
3. `leo run make_jct_non_jct 1100000u64 0u8`（非 JCT）或先跑 compute_tax_tag_for_test 再 make_jct_jct（JCT）。
4. `leo run create_invoice` + 15 个参数（从 `inputs/` 下 v3 的 `.in` 的 `[create_invoice]` 按顺序复制）。
5. 需要时：`leo run get_invoice_tax_tag <invoice_id>`、`leo run get_payment_commitment <invoice_id> <commitment>` 等。

**pay_invoice_credits_private / pay_invoice_usdcx / cancel_invoice** 等输入含 Record：Credits 路径需 `credits.aleo/credits` 的 pay_record + buyer 的 InvoiceRecord；USDCx 路径需 test_usdcx 的 Token record + InvoiceRecord + `[MerkleProof; 2]`。需把 create 或钱包返回的 record 按签名顺序传入（通常粘贴整段到命令行）。

---

## 本目录 `tests/inputs/v3/` 与根目录 `inputs/`

- **`run_manual.sh`**：一键执行 v3.1 流程（create_invoice、cancel_invoice、pay_invoice_credits_private、pay_invoice_usdcx）。在项目根运行 `./tests/inputs/v3/run_manual.sh`。要跑 Step 8 需设置 `BUYER_PRIVATE_KEY` + `CREDITS_RECORD`；要跑 Step 12 需设置 `BUYER_PRIVATE_KEY` + `TOKEN_RECORD` + `USDCX_PROOFS`。
- **`inputs/`**（项目根）：按 `[transition名]` 分块的参数字段，便于复制到命令行；合约为 **zk_invoice_v3_1.aleo**。
