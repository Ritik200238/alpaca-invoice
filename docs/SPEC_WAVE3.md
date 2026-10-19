# Wave 3 — Interface Specification (SPEC)

> **用途**：定义各层边界接口，供并行开发使用。即使某一层的实现尚未完成，其他层的 Agent 也可依照本文件中的类型与契约独立推进。
>
> **版本**：Wave 3.1 — 日本合规 + 原子结算 + 隐私支付路径升级  
> **参考**：`docs/ARCHITECTURE.md`、`docs/TODO_WAVE3.md`、`docs/WAVE3.md`

---

## 0. 阅读指引

| 符号 | 含义 |
|------|------|
| ✅ 已实现 | 当前代码库中已存在，本 SPEC 仅做声明 |
| 🆕 新增 | Wave 3 新增，需要实现 |
| 🔧 修改 | 已有实现需要改造 |

**层级依赖规则**：

```
View  ──依赖──►  Controller  ──依赖──►  Service
                                         │
                                         ▼
                                       Model (Store)
```

各层只能向下依赖，**不得跨层调用**（View 不直接读 Store；Service 不感知 Controller 状态）。

---

## 1. 共享领域类型（Domain Types）

> 文件：`lib/types.ts`

### 1.1 基础原语（✅ 已实现，无需修改）

```typescript
export type AleoAddress = `aleo1${string}`;
export type AleoField  = `${string}field`;
export type AleoTransactionId = `at1${string}`;
export type Microcredits = bigint;

export enum InvoiceStatus {
  PENDING   = 0,
  PAID      = 1,
  CANCELLED = 2,
  EXPIRED   = 3,
}
```

### 1.2 货币枚举（🆕 Wave 3 新增）

```typescript
/** 发票结算货币类型（对应合约 currency_flag: u8） */
export enum CurrencyFlag {
  CREDITS = 0,   // credits.aleo / transfer_private（Wave 3.1 全隐私）
  USDCX   = 1,   // test_usdcx_stablecoin.aleo / transfer_private（Wave 3.1 全隐私，与 Credits 对称）
}
```

### 1.3 税率相关类型（🆕 Wave 3 新增）

```typescript
/**
 * 单个税率分组（对应合约 TaxGroup struct）
 * rate_bps: 税率基点，10% = 1000，8% = 800，0% = 0
 */
export interface TaxGroup {
  rate_bps: number;   // u32 in contract
  net_sum:  bigint;   // u64 in contract，税前金额之和
  tax_sum:  bigint;   // u64 in contract，税额之和
}

/**
 * 两档税率组合（对应合约 TaxGroups struct）
 * group_a: 10% 标准税率
 * group_b:  8% 轻课税税率
 */
export interface TaxGroups {
  group_a: TaxGroup;  // 10%
  group_b: TaxGroup;  //  8%
}

/** 前端表单中单个商品行 */
export interface LineItemV3 {
  description: string;
  quantity:    number;
  unitPrice:   number;   // 含税单价（JPY）
  taxRate:     0 | 8 | 10;  // 选择税率（%）
  /** 系统自动计算，UI 锁定只读 */
  taxAmount?:  number;
  amount?:     number;   // 税前金额 = unitPrice * quantity / (1 + taxRate/100)
}
```

### 1.4 Invoice 类型扩展（🔧 修改 `Invoice`）

```typescript
/** 在现有 Invoice 接口基础上新增 Wave 3 字段 */
export interface Invoice {
  // ✅ 已有字段（保持不变）
  id:          AleoField;
  seller:      AleoAddress;
  buyer:       AleoAddress;
  amount:      Microcredits;
  taxAmount?:  Microcredits;
  invoiceHash: AleoField;
  dueDate:     Date;
  createdAt:   Date;
  status:      InvoiceStatus;
  orderId?:    AleoField;
  currency?:   AleoField;
  itemsHash?:  AleoField;
  memoHash?:   AleoField;
  details?:    InvoiceDetails;
  nonce?:      AleoField;
  auditKey?:   string;
  metadata?: {
    confirmationStatus: 'SENDING' | 'CONFIRMED';
    lastUpdated:        Date;
    dataSource:         'local' | 'chain';
    action?:            'create' | 'cancel' | 'pay';
  };

  // 🆕 Wave 3 新增字段
  /** BHP256(TaxGroups) — 链上 tax_tag field */
  taxTag?:         AleoField;
  /** BHP256(T_number as u64) — 链上 jct_registration field */
  jctRegistration?: AleoField;
  /** 发票总支付额 = net_sum + tax_sum（所有税率组之和） */
  totalAmount?:    Microcredits;
  /** 结算货币 (0=Credits, 1=USDCx) */
  currencyFlag?:   CurrencyFlag;
  /** JCT 模式下原始税率分组（用于本地 PDF 渲染，不上链） */
  taxGroups?:      TaxGroups;
  /** JCT 登记号明文（仅在 JCT 模式下填写，13 位数字字符串） */
  tNumber?:        string;
}
```

### 1.5 PaymentRecord 类型（🔧 新增 `paymentId` + `settlementAnchor`）

```typescript
export interface PaymentReceipt {
  paymentId:        AleoField;          // 🆕 Wave 3：payment_id（审计用）
  invoiceId:        AleoField;
  payer:            AleoAddress;
  payee:            AleoAddress;
  amount:           Microcredits;
  paidAt:           Date;
  /**
   * 🔧 Wave 3.1（修订）：结算锚点 = 承诺哈希（payment_commitment）
   * = BHP256::hash_to_field(PaymentCommitData { invoice_id, amount, nonce })
   * 不再是公开 tx_id_hash（Wave 3.0 方案），而是由 invoice_id + amount + nonce 派生的承诺。
   * 审计流程：
   *   1. 买家披露 (invoice_id, amount, nonce) 给审计员
   *   2. 审计员本地重算哈希，验证 = settlementAnchor
   *   3. 调用 InvoiceRegistryService.getPaymentCommitment(settlementAnchor) 查询链上
   *      payment_commitments mapping → 返回 invoice_id，与 envelope 核对一致
   * Credits 私有转账：无余额变动痕迹，承诺验证是唯一可信证明
   * USDCx 公开转账：额外可通过 balances mapping 验证余额变动
   */
  settlementAnchor: AleoField;   // = payment_commitment
}
```

### 1.6 发票创建参数（🔧 修改）

```typescript
export interface CreateInvoiceParams {
  buyer:    AleoAddress;
  amount:   Microcredits;
  dueDate:  Date;
  details:  InvoiceDetails;
  audit?: {
    auditKey:      string;
    scopesBitmask: bigint;
    expiresAt:     number;
  };

  // 🔧 Wave 3 JCT（JCT-only — Standard 模式已移除，以下字段全部为必填）
  /** 税率分组数据，由表单 lineItems 聚合，始终传入 */
  taxGroups:        TaxGroups;
  /** tax_tag，由 CryptoService.hashTaxGroups 生成，始终传入 */
  taxTag:           AleoField;
  /** jct_registration，由 CryptoService.hashTNumber 生成，始终传入 */
  jctRegistration:  AleoField;
  /** 结算货币标志，始终传入 */
  currencyFlag:     CurrencyFlag;
  /** JCT 登记号明文（13 位数字），始终必填 */
  tNumber:          string;
}
```

### 1.7 Wave 3 审计包类型（🆕）

```typescript
/**
 * Wave 3 审计包 Envelope（v3.0）
 * 扩展自 AuditPackageEnvelope（v2.2.0），增加角色 + tax 字段
 */
export interface AuditPackageEnvelopeV3 {
  version:    '3.0.0';
  audit_type: 'selective_disclosure';
  /** 审计角色：买家打包 PaymentRecord，卖家打包 PAID InvoiceRecord */
  role:       'buyer' | 'seller';
  network:    string;
  contract:   string;
  context: {
    invoice_ids:    AleoField[];      // 批量（可多条 Record）
    audit_key_hash: AleoField;
    expires_at:     number;           // Unix seconds
  };
  encryption: {
    algorithm:  'AES-256-GCM';
    iv:         string;
    auth_tag:   string;
    ciphertext: string;
    /** 卖家专属：加密后的 TaxGroups 明细（用于 Tax Check 步骤） */
    tax_groups_ciphertext?: string;
    tax_groups_iv?:         string;
    tax_groups_auth_tag?:   string;
  };
  /** 卖家包专属：T 号码明文，审计员可直接读取做 Identity 核验 */
  jct_registration_hint?: string;
}
```

---

## 2. 合约层接口（Contract Layer）

> 文件：`src/main.leo`（已实现），前端侧类型声明位于 `lib/contract.ts`

### 2.1 合约 Transition 输入/输出规范

#### `create_invoice` （🔧 参数结构变更）

```typescript
/** 对应 CreateInvoiceJct struct */
export interface CreateInvoiceJctInput {
  // 原有参数
  buyer:        string;   // AleoAddress
  amount:       string;   // u64 (microcredits)
  due_date:     string;   // u32
  nonce:        string;   // field
  order_id:     string;   // field
  currency:     string;   // field
  items_hash:   string;   // field
  memo_hash:    string;   // field
  invoice_hash: string;   // field
  // 🆕 Wave 3
  tax_tag:         string;   // field (0field if non-JCT)
  jct_registration: string;  // field (0field if non-JCT)
  total_amount:    string;   // u64
  currency_flag:   string;   // u8 (0=Credits, 1=USDCx)
}

/** create_invoice 返回两条 InvoiceRecord（seller + buyer） */
export interface CreateInvoiceOutput {
  sellerRecord: string;   // 加密 Record（owner: seller）
  buyerRecord:  string;   // 加密 Record（owner: buyer）
}
```

#### `pay_invoice_credits_private`（🆕 Wave 3.1 — Credits 全隐私路径）

```typescript
/**
 * Wave 3.1：Credits 私有 Record 转账 + 链上承诺存证
 * 底层调用：credits.aleo/transfer_private(pay_record, seller, total_amount)
 * 无 tx_id_hash 公开参数；settlement_anchor = payment_commitment（承诺哈希）
 */
export interface PayInvoiceCreditsPrivateInput {
  pay_record:      string;   // credits.aleo/credits Record（buyer 持有的私有 credits 记录）
  invoice_record:  string;   // InvoiceRecord（buyer 持有）
  payment_nonce:   string;   // field，随机 nonce，用于生成 payment_commitment
  paid_at:         string;   // u32，支付时间戳（须 <= invoice.due_date）
}

/**
 * 返回 6 个输出：
 * [0] credits.aleo/credits  seller 收到的 credits 记录
 * [1] credits.aleo/credits  buyer 找零 credits 记录
 * [2] PaymentRecord（buyer，settlement_anchor = BHP256(invoice_id ‖ amount ‖ nonce)）
 * [3] InvoiceRecord buyer_PAID
 * [4] InvoiceRecord seller_PAID
 * [5] Future（finalize：写 invoice_status + 写 payment_commitments[commitment] = invoice_id）
 */
export interface PayInvoiceCreditsPrivateOutput {
  sellerCredits:       string;
  changeCredits:       string;
  paymentRecord:       string;   // settlement_anchor = commitment hash
  buyerInvoiceRecord:  string;
  sellerInvoiceRecord: string;
  future:              string;
}
```

#### `pay_invoice_usdcx`（🔧 Wave 3.1 — 全隐私，与 Credits 完全对称）

```typescript
/**
 * Wave 3.1：USDCx 全隐私路径
 * 底层调用：test_usdcx_stablecoin.aleo/transfer_private(recipient, amount, token_record, proofs)
 *   → (ComplianceRecord, Token, Token, Future)
 * 注意：与 credits.aleo/transfer_private 不完全对称——
 *   需传入 [MerkleProof; 2]（freeze list 合规），返回额外 ComplianceRecord，且有 Future 须 await。
 * settlement_anchor = payment_commitment = BHP256(invoice_id ‖ amount ‖ nonce)（同 Credits 路径）
 * token amount 类型 u128，合约内须 invoice.total_amount as u128
 */
export interface PayInvoiceUsdcxInput {
  token_record:    string;   // test_usdcx_stablecoin.aleo/Token record（buyer 持有的私有 Token）
  invoice_record:  string;   // InvoiceRecord（buyer 持有）
  payment_nonce:   string;   // field，随机 nonce，用于生成 payment_commitment
  paid_at:         string;   // u32
  proofs:          string;   // [test_usdcx_stablecoin.aleo/MerkleProof; 2]（freeze list 合规证明，前端从链上获取）
}

/**
 * 返回 7 个输出：
 * [0] test_usdcx_stablecoin.aleo/Token          seller 收到的 Token record
 * [1] test_usdcx_stablecoin.aleo/Token          buyer 找零 Token record
 * [2] test_usdcx_stablecoin.aleo/ComplianceRecord  合规记录（freeze list 验证凭证）
 * [3] PaymentRecord（settlement_anchor = BHP256(invoice_id ‖ amount ‖ nonce)）
 * [4] InvoiceRecord buyer_PAID
 * [5] InvoiceRecord seller_PAID
 * [6] Future（finalize：transfer_future.await() + 写 invoice_status + payment_commitments）
 */
export interface PayInvoiceUsdcxOutput {
  sellerToken:         string;
  changeToken:         string;
  complianceRecord:    string;
  paymentRecord:       string;
  buyerInvoiceRecord:  string;
  sellerInvoiceRecord: string;
  future:              string;
}
```

#### `cancel_invoice`（✅ 不变）

```typescript
export interface CancelInvoiceInput {
  invoice_record: string;  // InvoiceRecord（seller 持有）
}
```

### 2.2 USDCx 程序接口规范（`test_usdcx_stablecoin.aleo`）

> **Wave 3.1 变更**：不再使用自建的 `usdcx_test_alpaca_v1.aleo`，改用 Aleo 官方在 Testnet 已部署的 `test_usdcx_stablecoin.aleo`（Circle xReserve 支持的官方测试稳定币）。无需自行部署，直接依赖链上版本。

**链上关键 Record / Mapping / Transition（Wave 3.1 使用部分）**：

```typescript
/**
 * test_usdcx_stablecoin.aleo — 链上接口（Wave 3.1 全隐私路径）
 * 金额类型：u128（注意：与 InvoiceRecord.total_amount u64 不同，调用时须强制转换）
 */

// Token 私有记录（买家须持有此 record）
// record Token { owner: address, amount: u128 }

// 公开余额 mapping（Wave 3.1 不使用）
// mapping balances: address => u128

export interface TestUsdcxInterface {
  /**
   * ✅ Wave 3.1 主路径：私有 Record 转账
   * 注意：与 credits.aleo/transfer_private **不完全对称**
   *   - 需要 [MerkleProof; 2]（freeze list 合规，前端从链上获取）
   *   - 返回额外的 ComplianceRecord（freeze list 合规凭证）
   *   - **有 Future**，必须在 finalize 中 await
   * 买家须持有足够 amount 的 Token record 以及 MerkleProof 数组
   */
  transfer_private(
    recipient: string /* address */,
    amount: string /* u128 */,
    token_record: string /* Token record */,
    proofs: string /* [MerkleProof; 2] */
  ): [ComplianceRecord, Token, Token, Future];  // (compliance_record, recipient_token, change_token, future)

  /**
   * 降级备用：公开余额扣款，Wave 3.1 不使用
   */
  transfer_public_as_signer(recipient: string, amount: string /* u128 */): Future;

  /**
   * 降级备用：需 Approve，Wave 3.1 不使用
   */
  transfer_from_public(owner: string, recipient: string, amount: string /* u128 */): Future;

  /**
   * 未来扩展：需 Credentials.record，Wave 4 规划
   */
  transfer_private_with_creds(...args: any[]): any;
}
```

> **`program.json` 依赖配置**（Wave 3.1）：
> ```json
> { "name": "test_usdcx_stablecoin.aleo", "location": "network", "path": null }
> ```
> 无需 local stub，直接使用链上版本。旧 `usdcx_test_alpaca_v1.aleo` 依赖删除。

### 2.3 链上 Mapping 查询键

```typescript
/** lib/contract.ts 中维护的常量 */
export const PROGRAM_ID_V3 = 'zk_invoice_v3_1.aleo' as const;  // 🔧 Wave 3.1 升级（v3_0 已部署不可变）

export const MAPPINGS = {
  invoice_status:  'invoice_status',   // key: invoice_id (field)  → value: status (u8)
  invoice_hash:    'invoice_registry', // key: invoice_id (field)  → value: invoice_hash (field)
  invoice_tax_tag: 'invoice_tax_tag',  // key: invoice_id (field)  → value: tax_tag (field)
  invoice_jct_reg: 'invoice_jct_reg',  // key: invoice_id (field)  → value: jct_registration (field)
  /**
   * 🆕 Wave 3.1 承诺机制（替换旧 invoice_tx_id）：
   *   key   = payment_commitment = BHP256(invoice_id ‖ amount ‖ nonce)
   *   value = invoice_id
   * 审计 Step 2：InvoiceRegistryService.getPaymentCommitment(settlementAnchor) 查询此 mapping。
   * ⚠️ 旧 invoice_tx_id（Wave 3.0）已废弃，不在 zk_invoice_v3_1.aleo 中出现。
   */
  payment_commitments: 'payment_commitments',  // key: commitment (field) → value: invoice_id (field)  🆕 Wave 3.1
} as const;
```

---

## 3. Service 层接口

### 3.1 `ICryptoService`（🔧 新增方法）

> 文件：`services/CryptoService/ICryptoService.ts`

在现有接口基础上追加以下方法：

```typescript
export interface ICryptoService {
  // ✅ 所有现有方法保持不变（略）

  /**
   * 🆕 在前端计算 BHP256::hash_to_field(TaxGroups)
   * 结果作为合约的 tax_tag 输入
   * @param groups TaxGroups 对象（group_a 10%, group_b 8%）
   * @returns AleoField
   */
  hashTaxGroups(groups: TaxGroups): Promise<AleoField>;

  /**
   * 🆕 将 13 位 T 号码字符串转为 u64 并计算 BHP256::hash_to_field
   * 结果作为合约的 jct_registration 输入
   * @param tNumber 13 位纯数字字符串（如 "1234567890123"）
   * @returns AleoField
   */
  hashTNumber(tNumber: string): Promise<AleoField>;

  /**
   * 🆕 将 TaxGroups 序列化为合约兼容格式（Leo struct 字符串）
   * 供 WalletService.requestTransaction inputs 数组使用
   * @param groups TaxGroups 对象
   * @returns Leo struct 字符串，例如 "{group_a: {rate_bps: 1000u32, ...}, ...}"
   */
  serializeTaxGroupsForContract(groups: TaxGroups): string;

  /**
   * 🆕 本地执行 tax_tag 三项验证（A/B/C），与合约电路对齐
   * A: group.net_sum * group.rate_bps / 10000 == group.tax_sum
   * B: BHP256(TaxGroups) == tax_tag
   * C: sum(net_sum + tax_sum) == total_amount
   * @returns 每项验证结果及错误信息
   */
  verifyTaxTag(params: {
    taxGroups:   TaxGroups;
    taxTag:      AleoField;
    totalAmount: bigint;
  }): Promise<{
    a: { ok: boolean; detail?: string };
    b: { ok: boolean; detail?: string };
    c: { ok: boolean; detail?: string };
    allPassed: boolean;
  }>;
}
```

### 3.2 `IAleoProtocolService`（🔧 职责边界收窄）

> 文件：`services/AleoProtocolService/IAleoProtocolService.ts`
>
> **职责边界（Wave 3.1 修订）**：通用 RPC 能力 — fee 估算、TX 提交、Record 链上验证。  
> **不承载**发票业务 Mapping 查询，也不再需要 USDCx allowance 查询（Wave 3.1 USDCx 改用 `transfer_public_as_signer`，无 Approve 步骤）。

```typescript
export interface IAleoProtocolService {
  // ✅ 所有现有方法保持不变（略）

  // ❌ Wave 3.1 移除：getUsdcxAllowance — USDCx 改用 transfer_public_as_signer，不再需要 allowance 查询
  // ❌ Wave 3.1 降级：getPublicTransfersByTxId — Credits 私有转账无链上余额痕迹，审计改用承诺机制；
  //    USDCx 公开路径可保留此方法作为可选验证，但不在 Step 2 主流程中使用

  // ❌ 以下方法已从本接口移除，迁移至 IInvoiceRegistryService（见 3.5）：
  //    getInvoiceTaxTag / getInvoiceJctReg
}
```

### 3.3 `IWalletService`（🔧 扩展）

> 文件：`services/WalletService/IWalletService.ts`

```typescript
export interface IWalletService {
  // ✅ 所有现有方法保持不变（略）

  // 🔧 Wave 3.1 注：USDCx 改用 transfer_public_as_signer，无需 Approve + Pay 两步连续 TX。
  // requestSequentialTransactions 在 Wave 3.1 USDCx 路径中不再需要；保留接口定义供未来扩展。
  /**
   * 序列化提交连续 TX（保留，供 Future Wave USDCx 私有路径等使用）
   */
  requestSequentialTransactions?(
    txList: Array<{
      programId:    string;
      functionName: string;
      inputs:       string[];
      fee:          number;
    }>
  ): Promise<AleoTransactionId[]>;
}
```

### 3.4 `IAuditService`（🔧 扩展 Wave 3）

> 文件：`services/AuditService/IAuditService.ts`

在现有接口基础上追加以下方法/类型变更：

```typescript
/** 🆕 Wave 3 角色感知的审计包生成参数 */
export interface GenerateAuditPackageParamsV3 {
  /** 角色决定打包哪种 Record 类型 */
  role: 'buyer' | 'seller';
  /**
   * buyer 路径：传入 PaymentRecord 列表
   *   → 密文包含：payment_id、invoice_id、amount、paid_at、settlement_anchor
   *   → settlement_anchor 是 Step 2 资产核对的起点，审计员凭此独立回溯链上流水
   *
   * seller 路径：传入状态为 PAID 的 InvoiceRecord 列表
   *   → 密文额外包含：TaxGroups 明细（写入 tax_groups_ciphertext）
   *   → jct_registration_hint（T 号码明文，供 Step 1 Identity 读取）
   */
  records: Array<{
    invoiceId: AleoField;
    invoice?:  Invoice;          // seller 路径必须包含 Invoice（含 taxGroups）
    receipt?:  PaymentReceipt;   // buyer 路径必须包含 PaymentReceipt（含 settlementAnchor）
  }>;
  expiresAt:   number;           // Unix seconds
  permissions: string[];
  /** 卖家包专属：T 号码明文 */
  tNumber?:    string;
}

/** 🆕 Wave 3 审计包生成结果 */
export interface GenerateAuditPackageResultV3 {
  envelope:     AuditPackageEnvelopeV3;
  auditKey:     string;         // 64 hex chars，给审计员
  auditKeyHash: AleoField;      // 用于 set_audit_authorization
  /** 授权抽屉数据摘要 */
  summary: {
    recordCount:    number;
    totalAmount:    bigint;     // 所有 Record 金额之和
    totalTaxAmount: bigint;     // 所有 Record 税额之和（seller 路径）
  };
}

/** 🆕 Wave 3 三阶段验证结果 */
export interface VerifyAuditPackageV3Result {
  overallValid: boolean;
  step1Identity: {
    ok:             boolean;
    tNumber?:       string;    // T 号码明文（来自 jct_registration_hint）
    chainJctReg?:   AleoField; // 链上 jct_registration（InvoiceRegistryService.getInvoiceJctReg）
    hashMatch?:     boolean;   // BHP256(tNumber as u64) === chainJctReg
    ntaApiResult?:  { name: string; status: string } | null; // NTA API，可降级为 null
    message:        string;
  };
  step2MoneyFlow: {
    ok:               boolean;
    /**
     * Wave 3.1：settlementAnchor = payment_commitment = BHP256(invoice_id ‖ amount ‖ nonce)
     * 承诺验证流程：
     *   1. 买家披露 (invoice_id, amount, nonce) → 审计员本地重算哈希 → 验证 = settlementAnchor
     *   2. InvoiceRegistryService.getPaymentCommitment(settlementAnchor)
     *      → 查询 payment_commitments mapping → 返回 invoice_id，比对一致性
     * Credits 私有转账：无链上余额变动痕迹，承诺验证是唯一可信证明
     * USDCx 公开转账：可额外通过 balances mapping 验证（可选增强）
     */
    settlementAnchor?:    AleoField;
    commitmentMatch?:     boolean;   // 本地重算哈希 = settlementAnchor
    invoiceIdMatch?:      boolean;   // payment_commitments[settlementAnchor] = invoice_id
    message:              string;
  };
  step3TaxCheck: {
    ok:             boolean;
    taxGroups?:     TaxGroups;   // 解密后的明细（来自 tax_groups_ciphertext）
    chainTaxTag?:   AleoField;   // 链上 invoice_tax_tag（InvoiceRegistryService.getInvoiceTaxTag）
    verificationA?: { ok: boolean; detail?: string };  // net_sum * rate_bps / 10000 === tax_sum
    verificationB?: { ok: boolean; detail?: string };  // BHP256(TaxGroups) === chainTaxTag
    verificationC?: { ok: boolean; detail?: string };  // sum(net_sum + tax_sum) === total_amount
    message:        string;
  };
}

export interface IAuditService {
  // ✅ 所有现有方法保持不变（略）

  /**
   * 🆕 Wave 3 角色隔离打包
   * buyer 路径：打包 PaymentRecord 列表（密文含 payment_id、invoice_id、amount、paid_at）
   * seller 路径：打包 PAID InvoiceRecord 列表（密文额外含 TaxGroups 明细）
   */
  generateV3(params: GenerateAuditPackageParamsV3): Promise<GenerateAuditPackageResultV3>;

  /**
   * 🔧 Wave 3.1 三阶段验证流水线（Step 2 改为承诺验证）
   * Step 1: 身份锚点 — T 号码哈希比对（registry.getInvoiceJctReg）+ NTA API（可降级）
   * Step 2: 资产核对 — 买家披露 (invoice_id, amount, nonce) → 本地重算 BHP256 →
   *          验证 = settlementAnchor → registry.getPaymentCommitment(settlementAnchor) 查链上
   * Step 3: 税务解密 — tax_groups_ciphertext 解密 → registry.getInvoiceTaxTag → 验证 A/B/C
   */
  verifyV3(
    envelope:  AuditPackageEnvelopeV3,
    auditKey:  string,
    services: {
      protocol: IAleoProtocolService;       // getPublicTransfersByTxId（可选 USDCx 额外验证）
      registry: IInvoiceRegistryService;    // getInvoiceJctReg / getPaymentCommitment / getInvoiceTaxTag
      crypto:   ICryptoService;             // verifyTaxTag / hashTNumber
    }
  ): Promise<VerifyAuditPackageV3Result>;
}
```

### 3.5 `IInvoiceRegistryService`（🔧 Wave 3 扩展）

> 文件：`services/InvoiceRegistryService/IInvoiceRegistryService.ts` + `InvoiceRegistryServiceImpl.ts`
>
> **职责边界**：专门查询 `zk_invoice_v3_1.aleo` 合约的**发票业务 Mapping**（Wave 3.1 升级版；旧 `zk_invoice_v3_0.aleo` 历史数据仍可通过旧程序 ID 单独查询）。  
> Wave 3 新增 Mapping 均属于发票业务语义，迁移至此层以维持 Service 层分层一致性（不让通用 RPC 层承载业务含义）。

```typescript
export interface IInvoiceRegistryService {
  // ✅ 现有方法保持不变（getInvoiceStatus、getCommitmentRoot 等，略）

  /**
   * 🆕 查询 invoice_tax_tag mapping
   * 供审计 Step 3（Tax Check）：拉取链上 tax_tag 后与本地重算结果比对
   * @param invoiceId invoice_id (field)
   * @returns tax_tag (field) 或 null
   */
  getInvoiceTaxTag(invoiceId: AleoField): Promise<AleoField | null>;

  /**
   * 🆕 查询 invoice_jct_reg mapping
   * 供审计 Step 1（Identity）：拉取链上 jct_registration 与审计包中 T 号码哈希比对
   * @param invoiceId invoice_id (field)
   * @returns jct_registration (field) 或 null
   */
  getInvoiceJctReg(invoiceId: AleoField): Promise<AleoField | null>;

  /**
   * 🆕 Wave 3.1：查询 payment_commitments mapping（替代旧 getInvoiceTxId）
   * 供审计 Step 2（Money Flow）承诺验证：
   *   用买家 PaymentRecord.settlement_anchor（= payment_commitment）作为 key，
   *   查出 invoice_id，确认与当前发票 id 一致。
   *   同时配合买家披露的 (invoice_id, amount, nonce) 本地重算哈希，双重确认。
   * @param commitment PaymentRecord.settlement_anchor = BHP256(invoice_id ‖ amount ‖ nonce)
   * @returns invoice_id (field) 或 null
   */
  getPaymentCommitment(commitment: AleoField): Promise<AleoField | null>;

  /**
   * @deprecated Wave 3.1 已废弃：invoice_tx_id mapping 在 zk_invoice_v3_1.aleo 中不存在。
   * 旧 Wave 3.0 数据可通过 zk_invoice_v3_0.aleo 查询。
   */
  getInvoiceTxId?(settlementAnchor: AleoField): Promise<AleoField | null>;
}
```

---

## 4. Controller 层接口

> Controller 是 Hook，向 View 暴露数据与操作函数；不直接持有 Service 实例（通过 Context 注入）。

### 4.1 `useTransactionController`（🔧 修改）

> 文件：`controller/Transaction/useTransactionController.ts`

```typescript
export interface UseTransactionControllerReturn {
  // ✅ 现有字段保持不变
  isCreating:   boolean;
  isPaying:     boolean;
  isCancelling: boolean;
  error:        AppError | null;

  /**
   * ✅ 创建发票（🔧 已扩展支持 JCT 参数）
   * - 若 params.taxGroups 存在，Controller 内自动调用 CryptoService 计算 tax_tag / jct_registration
   * - 若 params.currencyFlag 未提供，默认 CurrencyFlag.CREDITS
   */
  executeCreateInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult>;

  /**
   * 🔧 支付发票（Wave 3.1 原子结算，分 Credits / USDCx 路径）
   * - 读取 invoice.currencyFlag 自动路由
   * - Credits 路径：需从钱包获取买家的 credits.aleo/credits 私有 Record 传入合约
   * - USDCx 路径：需从钱包获取买家的 test_usdcx_stablecoin.aleo/Token 私有 Record 传入合约（与 Credits 对称）
   * - 两路径均为全隐私 transfer_private，链上无余额变动痕迹
   * - 两路径均生成 payment_nonce（随机 field）计算承诺哈希；nonce 须持久化至 ReceiptStore
   * - 当 requestRecords 返回无可用未花费 credits 时，应抛出 WalletError.INSUFFICIENT_FEE（非 DECRYPTION_FAILED），以便前端显示「余额不足」类提示
   */
  executePay(invoiceId: AleoField): Promise<void>;

  /**
   * ✅ 取消发票（不变）
   */
  executeCancel(invoiceId: AleoField): Promise<void>;

  /**
   * ✅ 提交链上审计授权（不变）
   */
  executeSetAuditAuthorization(params: {
    invoiceId:     AleoField;
    auditKeyHash:  AleoField;
    scopesBitmask: bigint;
    expiresAt:     number;
  }): Promise<void>;

  // 🆕 Wave 3.1 支付状态（Credits 与 USDCx 均使用私有 Record，状态字段对称）
  /**
   * Credits 路径：credits.aleo/credits record 是否已从钱包获取。
   */
  creditsRecordStatus: 'idle' | 'loading' | 'ready' | 'missing';
  /**
   * USDCx 路径：test_usdcx_stablecoin.aleo/Token record 是否已从钱包获取。
   * Wave 3.1 全隐私：与 creditsRecordStatus 对称，USDCx 也需私有 Record。
   */
  usdcxTokenRecordStatus: 'idle' | 'loading' | 'ready' | 'missing';
  /** 当前链上确认阶段（Phase 1 = 资产准备 / 2 = Proving / 3 = Finalizing） */
  paymentPhase: 1 | 2 | 3 | null;
  /** 链上确认深度（Confirmations，Phase 3 显示用） */
  confirmationDepth: number;
}
```

### 4.2 `useInvoiceDetail`（🔧 修改）

> 文件：`controller/Invoice/useInvoiceDetail.ts`

```typescript
export interface UseInvoiceDetailReturn {
  // ✅ 现有字段保持不变
  invoice:        Invoice | null;
  isLoading:      boolean;
  isSyncing:      boolean;
  canPay:         boolean;
  canCancel:      boolean;
  isSeller:       boolean;
  isBuyer:        boolean;
  isPaid:         boolean;
  isPending:      boolean;
  isCancelled:    boolean;
  syncChain():    Promise<void>;

  // 🆕 Wave 3 派生字段
  /** 是否为 JCT 发票（tax_tag !== '0field'） */
  isJctInvoice:   boolean;
  /** 是否为 USDCx 发票（currencyFlag === 1） */
  isUsdcxInvoice: boolean;
  /** 税率分组（用于详情页渲染税务明细，来自 invoice.taxGroups） */
  taxGroups:      TaxGroups | null;
  /** 链上 tax_tag field（展示用） */
  taxTag:         AleoField | null;
  /** 链上 jct_registration field（展示用） */
  jctRegistration: AleoField | null;
  /** 发票总金额（含税） */
  totalAmount:    Microcredits | null;
}
```

### 4.2.1 `useInvoiceDetailPage`（🆕 新建）

> 文件：`controller/Invoice/useInvoiceDetailPage.ts`

详情页专用 Controller：组合 `useInvoiceDetail`，并承接 registry 锚点拉取、审计包下载等逻辑，使 `app/(app)/invoices/[id]/page.tsx` 仅负责渲染。

```typescript
export interface UseInvoiceDetailPageReturn extends IInvoiceDetail {
  displayCurrency: string;
  anchors: { commitment?: string | null; rules?: string | null; fieldCommitments?: any; auth?: any; counter?: number | null };
  isFetchingAnchors: boolean;
  downloadMsg: string;
  safeStringify: (obj: any) => string;
  handleDownloadPackage: (mode: 'minimal' | 'full') => Promise<void>;
}
```

### 4.3 `useInvoices`（🔧 修改）

> 文件：`controller/Invoice/useInvoices.ts`

```typescript
export interface UseInvoicesReturn {
  // ✅ 现有字段保持不变
  invoices:      Invoice[];
  isLoading:     boolean;
  isSyncing:     boolean;
  filter:        InvoiceFilter;
  setFilter(f: InvoiceFilter): void;

  // 🆕 Wave 3 派生聚合数据（供 Dashboard 使用）
  /** 所有 PENDING 进项发票总额（Account Payable） */
  totalAccountPayable:  bigint;
  /** 本月 PAID 发票总额（Total Paid） */
  totalPaidThisMonth:   bigint;
  /** tax_tag ≠ 0field 的已付发票可抵扣进项税额（JCT Deductible） */
  jctDeductibleAmount:  bigint;
  /** Credits vs USDCx 支付配比（资产饼图） */
  currencyDistribution: { credits: bigint; usdcx: bigint };
  /** 过去 6 个月进项/销项税额趋势（税务折线图） */
  taxTrend: Array<{
    month:      string;   // "YYYY-MM"
    inputTax:   bigint;   // 进项税
    outputTax:  bigint;   // 销项税
  }>;
}
```

**实现约束（Wave 3.1 补充）**：
- 发票列表批量同步（`handleSyncAll`）仅扫描 `InvoiceRecord`（`scanAllInvoiceRecords`），不再在该页面触发 `scanAllPaymentRecords`
- `PaymentRecord` 全链扫描职责下沉至收据域（`useReceipts` / `receipts` 页面）

### 4.3.1 `useInvoicesPageController`（🆕 新建）

> 文件：`controller/Invoice/useInvoicesPageController.ts`

```typescript
export interface UseInvoicesPageControllerReturn extends UseInvoicesReturn {
  roleFilter: 'all' | 'sent' | 'received';
  displayInvoices: InvoiceWithRole[];
  handleRoleChange(role: 'all' | 'sent' | 'received'): void;
  exportCsv(): void;
  handlePayWithGuard(invoice: Invoice, chainStatus: 'SENDING' | 'CONFIRMED' | null | undefined): void;
  handleCancelWithGuard(invoice: Invoice, chainStatus: 'SENDING' | 'CONFIRMED' | null | undefined): void;
  getExplorerUrl(invoice: Invoice): string | null;
}
```

职责：
- 路由筛选（role filter）与 URL query 同步
- CSV 导出、链上状态动作守卫（pay/cancel 仅在 CONFIRMED 可执行）
- 生成 Aleo Explorer 交易链接（`invoice.transactionId`）

### 4.4 `useInvoiceForm`（🆕 新建，架构合规）

> 文件：`controller/Invoice/useInvoiceForm.ts`  
> 实现状态：✅ 已完成

将原本散落在 `components/invoice-form.tsx` 中的全部业务逻辑提取为独立 Hook，使 View 层退化为纯渲染层。

```typescript
/** 表单行项原始输入状态（string 类型，受控输入用） */
export interface LineItemRow {
  id:          string;
  description: string;
  quantity:    string;
  unitPrice:   string;
  jctTaxRate:  '10' | '8' | '0';
}

/** JCT PDF 预览所需的计算结果 */
export interface JctPreviewData {
  lineItemsV3: LineItemV3[];
  summary:     JctPdfPreviewSummary;
}

export interface UseInvoiceFormReturn {
  // ── 原始表单状态（供 View 受控输入绑定）
  tNumber:     string;
  setTNumber:  (v: string) => void;      // 内部自动过滤非数字 + 截断为 13 位
  ntaCheck:    'idle' | 'checking' | 'ok' | 'unavailable';
  buyer:       string;
  setBuyer:    (v: string) => void;
  lineItems:   LineItemRow[];
  dueDate:     string;
  setDueDate:  (v: string) => void;
  currency:    string;
  setCurrency: (v: string) => void;
  orderId:     string;
  setOrderId:  (v: string) => void;
  notes:       string;
  setNotes:    (v: string) => void;

  // ── 派生展示值（由表单状态 useMemo 计算）
  parsedLineItems: LineItem[];     // 解析后的行项（数值化）
  parsedAmount:    number;         // 小计（税前金额之和）
  taxAmount:       number;         // 各行税额之和（按 jctTaxRate 计算）
  total:           number;         // parsedAmount + taxAmount
  jctPreviewData:  JctPreviewData; // 实时 PDF 预览所需数据

  // ── 行项操作（纯数组更新，无副作用）
  addLineItem:    () => void;
  removeLineItem: (id: string) => void;
  updateLineItem: (id: string, field: keyof LineItemRow, value: string) => void;

  // ── NTA T 号码校验（链外 API，可降级）
  verifyTNumberWithNta: () => Promise<void>;

  // ── 审计授权子控制器（委托 useInvoiceFormAudit）
  audit: ReturnType<typeof useInvoiceFormAudit>;

  // ── 验证错误（字段级）
  errors: Record<string, string>;

  // ── 交易状态（委托 useTransactionController，只读）
  isProcessing:    boolean;
  currentProgress: number;  // 0–100
  currentLog:      string;

  // ── 提交
  handleSubmit: (e: React.FormEvent) => Promise<void>;

  // ── 卖家标识（只读，供 View 渲染卖家地址 + JctPdfPreview.sellerName）
  publicKey: string | null;
}
```

**架构约定**：
- `validate()` 私有，在 `handleSubmit` 内部调用，不暴露给 View
- 所有业务计算（`buildTaxGroupsFromLineItems`、`buildDetails`）为纯函数，定义在 Hook 文件内，不依赖 React
- `AleoProtocolService` WASM 预热在 `useEffect` 中完成，View 层无需感知

### 4.5 `useAuditPackageGenerate`（🔧 扩展角色感知）

> 文件：`controller/Audit/useAuditPackageGenerate.ts`

```typescript
export interface UseAuditPackageGenerateReturn {
  // ✅ 现有字段保持不变（波 2 接口）
  isGenerating:  boolean;
  error:         AppError | null;

  // 🆕 Wave 3
  /** 当前选择的角色 */
  role:           'buyer' | 'seller' | null;
  setRole(role: 'buyer' | 'seller'): void;

  /** 可选的 Record 列表（角色确定后填充） */
  availableRecords: Array<{
    id:         AleoField;   // invoice_id
    amount:     bigint;
    paidAt?:    Date;        // buyer: PaymentRecord.paid_at
    status?:    InvoiceStatus; // seller: InvoiceRecord.status
    selected:   boolean;
  }>;
  toggleRecord(id: AleoField): void;
  selectAll():   void;
  deselectAll(): void;

  /** 授权抽屉摘要（底部实时展示） */
  selectionSummary: {
    count:      number;
    totalAmount: bigint;
    totalTax:    bigint;
  };

  /** 有效期（Unix seconds） */
  expiresAt:    number | null;
  setExpiresAt(ts: number): void;

  /**
   * 生成并下载 JSON 包 + Audit Key
   * 成功后触发浏览器下载
   */
  generate(): Promise<void>;

  /** 生成结果（用于展示 key 或提交链上授权） */
  result: GenerateAuditPackageResultV3 | null;

  /**
   * 提交链上授权（调用 set_audit_authorization）
   * 需要先调用 generate() 获得 auditKeyHash
   */
  submitOnChainAuthorization(): Promise<void>;
}
```

### 4.6 `useAuditPackageVerify`（🔧 升级三阶段流水线）

> 文件：`controller/Audit/useAuditPackageVerify.ts`

```typescript
export interface UseAuditPackageVerifyReturn {
  // ✅ 现有字段保持不变（波 2 接口）
  isVerifying:  boolean;
  error:        AppError | null;

  /** 导入的 Envelope JSON */
  envelope:     AuditPackageEnvelopeV3 | null;
  /** 导入 JSON 包（拖拽/文件选择后调用） */
  importEnvelope(json: string): void;

  /** 输入的 Audit Key */
  auditKey:     string;
  setAuditKey(key: string): void;

  /** 识别到的角色（从 envelope.role 读取） */
  detectedRole: 'buyer' | 'seller' | null;

  /**
   * 🆕 Wave 3 三阶段流水线
   * 调用后依次执行 Step 1 → 2 → 3，每步结果实时更新：
   *   Step 1: registry.getInvoiceJctReg + NTA API（可降级）
   *   Step 2: 从密文读取 settlementAnchor（= payment_commitment）→ 买家披露 (invoice_id, amount, nonce) 本地重算哈希 → 验证 = settlementAnchor → registry.getPaymentCommitment(settlementAnchor) 查链上 payment_commitments mapping
   *   Step 3: 解密 tax_groups_ciphertext → registry.getInvoiceTaxTag → crypto.verifyTaxTag A/B/C
   */
  runVerification(): Promise<void>;

  /** 三阶段验证结果 */
  verificationResult: VerifyAuditPackageV3Result | null;

  /** 是否全部通过（激活「导出 PDF」按钮的条件） */
  allStepsPassed: boolean;

  /**
   * 导出合规判定 PDF 报告
   * 须在 allStepsPassed === true 后调用
   */
  exportPdfReport(): Promise<void>;
}
```

### 4.7 `useInvoiceChainScan`（🔧 新字段解析）

> 文件：`controller/Invoice/useInvoiceChainScan.ts`

```typescript
/**
 * 链上扫描到的 Wave 3 InvoiceRecord 原始字段（扩展 AleoInvoiceRecord）
 */
export interface AleoInvoiceRecordV3 extends AleoInvoiceRecord {
  // 🆕 Wave 3 字段
  tax_tag:          string;   // field
  jct_registration: string;   // field
  total_amount:     string;   // u64
  currency_flag:    number;   // u8
}

/**
 * 链上扫描到的 Wave 3 PaymentRecord（扩展原有 AleoPaymentRecord）
 */
export interface AleoPaymentRecordV3 extends AleoPaymentRecord {
  /**
   * 🆕 Wave 3：结算锚点 = 合约 public 参数 tx_id_hash
   * 需从链上解析的 PaymentRecord 字段中读取，并映射至本地 PaymentReceipt.settlementAnchor
   */
  settlement_anchor: string;  // field
  transactionId?: AleoTransactionId;
  blockHeight?: number;
}

/**
 * buildInvoiceFromChainRecord 映射规则（新增字段）
 * 输入：AleoInvoiceRecordV3
 * 输出：Invoice（含 taxTag、jctRegistration、totalAmount、currencyFlag）
 *
 * 注意：
 * - tax_tag === '0field' 时不写入 taxTag（保持 undefined）
 * - currency_flag 映射为 CurrencyFlag 枚举
 */
export type BuildInvoiceFromChainRecord = (record: AleoInvoiceRecordV3) => Invoice;

/**
 * buildReceiptFromChainRecord 映射规则（Wave 3 新增）
 * 输入：AleoPaymentRecordV3
 * 输出：PaymentReceipt（含 settlementAnchor）
 *
 * 注意：
 * - settlement_anchor 必须读取，缺失时抛出解析错误
 * - payment_id 来自简化计算 BHP256(invoice_id)
 */
export type BuildReceiptFromChainRecord = (record: AleoPaymentRecordV3) => PaymentReceipt;
```

### 4.9 `useReceipts`（🆕 新建）

> 文件：`controller/Receipt/useReceipts.ts`

```typescript
export interface UseReceiptsReturn {
  receipts: PaymentReceipt[];
  isLoading: boolean;
  isSyncing: boolean;
  showWalletPrompt: boolean;
  handleSyncAllReceipts(): Promise<void>;
  exportCsv(): string;
}
```

职责：
- 初始化时从 `ReceiptStore`（IndexedDB）加载本地收据
- 收据页触发 `scanAllPaymentRecords` 并落库（`setReceipts`）
- 对外暴露排序后的展示列表与导出能力

**实现约束（Wave 3.1 收据页防循环）**：
- 当本地收据为空时，仅**自动同步一次**（通过 `hasAutoSyncAttemptedRef` 标记），避免「sync 返回 0 条 → 依赖不变 → 再次触发 sync」导致的无限循环。
- 用户可随时通过「Sync」按钮手动再次拉取链上 PaymentRecord。

**`scanAllPaymentRecords` 行为（与合约 `main.leo` PaymentRecord 一致）**：
- `requestRecords(PROGRAM_ID)` 返回该程序下全部 record（含 InvoiceRecord 与 PaymentRecord）。
- 若钱包返回的 record 带 `recordName` / `record_name`，则仅解析 `recordName === 'PaymentRecord'` 的 record，避免将 InvoiceRecord 当作 PaymentRecord 解析；未提供 recordName 时仍对所有 record 做类型判断后只保留 PaymentRecord。

### 4.8 `useInvoicePollingCore`（🔧 轮询兼容 Wave 3）

> 文件：`controller/Invoice/useInvoicePollingCore.ts`

```typescript
/**
 * 轮询确认信号（Wave 3 变更）
 * pay_invoice_public 返回 3 条 Record（PaymentRecord + InvoiceRecord×2）
 * 轮询应识别以下任一情况作为支付成功信号：
 *   1. 扫描到状态为 PAID 的 InvoiceRecord
 *   2. 扫描到 PaymentRecord（含 settlement_anchor，payment_id ≠ 0field）
 *   3. invoice_status mapping 值为 1u8
 */
export type PollingSuccessSignal =
  | { type: 'paid_record';    record: AleoInvoiceRecordV3 }
  | { type: 'payment_record'; record: AleoPaymentRecordV3 }   // 🔧 Wave 3：使用 V3 类型（含 settlement_anchor）
  | { type: 'mapping_status'; status: 1 };
```

---

## 5. Model 层接口（Zustand Store）

### 5.1 `InvoiceState`（🔧 修改）

> 文件：`stores/Invoice/InvoiceState.ts`

```typescript
export interface InvoiceState {
  // ✅ 所有现有字段和方法保持不变（略）

  // 无新增 State 字段（Wave 3 新字段通过 Invoice 类型扩展已覆盖）
}

/**
 * 🔧 addInvoice / updateInvoice / setInvoices 需兼容 Invoice Wave 3 新字段的序列化/反序列化：
 * - taxTag, jctRegistration, totalAmount, currencyFlag, taxGroups, tNumber
 * 确保存入 IndexedDB 时正确保存，读取时正确还原。
 *
 * IndexedDB Schema 版本说明：
 * - 当前版本（Wave 2.2）：v2
 * - Wave 3 需升级至 v3，以支持新字段的持久化
 * - 版本迁移：旧记录缺失新字段时，使用默认值（taxTag: undefined, currencyFlag: 0）
 *
 * updateInvoice 首次持久化（Wave 3.1 补充）：
 * - 创建发票时 addInvoice(..., { persistFull: false }) 仅写内存，不落库。
 * - 链上确认后 AutoPoller 调用 updateInvoice(..., { persistFull: true, masterKey })。
 * - 若 IndexedDB 中无该 id 记录，updateInvoice 必须执行**插入**（用当前 merged invoice 构建完整 InvoiceStorageData，含 encryptedDetails），否则 details/lineItems 永远无法持久化，详情页解密后仍为 null。
 *
 * getAllInvoices(refreshMemory: true)（Wave 3.1 补充）：
 * - 用 IndexedDB 数据刷新内存时，必须**保留**仅存在于内存、且 confirmationStatus === 'SENDING' 的发票：其 invoiceHash 保留在 sendingInvoiceHashes 中，且合并回 invoices 列表。否则其他调用方（如详情页 useAuditPackageGenerate）触发 getAllInvoices 后会清掉新建未落库发票的 sending 状态，详情页轮询旋转不显示。
 */
```

### 5.2 `ReceiptStore`（🔧 新增 `paymentId` + `settlementAnchor`）

> 文件：`stores/Receipt/`

```typescript
export interface ReceiptState {
  receipts: PaymentReceipt[];

  addReceipt(receipt: PaymentReceipt): Promise<void>;
  updateReceipt(invoiceId: AleoField, patch: Partial<Pick<PaymentReceipt, 'settlementAnchor'>>): Promise<void>;
  setReceipts(items: PaymentReceipt[]): Promise<void>;
  getAllReceipts(): Promise<PaymentReceipt[]>;
  clear(): Promise<void>;
}

/**
 * 🔧 PaymentReceipt 存储时必须同时包含以下 Wave 3 新字段：
 *
 * - paymentId（Wave 3）：payment_id，审计包 buyer 路径需要
 * - settlementAnchor（Wave 3 关键）：PaymentRecord.settlement_anchor（tx_id_hash 公开锚点）
 *   审计员 Step 2 资产核对从本地收据中读取此字段，无需依赖任何外部数据。
 *
 * 旧版记录缺少这些字段时的兼容策略：
 * - paymentId 缺失 → 读取后为 '0field'
 * - settlementAnchor 缺失 → 读取后为 '0field'，Step 2 验证将报错提示"收据不含结算锚点"
 *
 * 持久化要求（Wave 3.1 补充）：
 * - ReceiptStore 与 InvoiceStore 一致，使用 IndexedDB（`zk_invoice_db`）
 * - 禁止仅依赖 localStorage 持久化收据
 */
```

---

## 6. View 层接口（Component Props）

> **架构规则（已落地）**：View 层不含任何业务逻辑。所有计算、验证、副作用均在 Controller 层的 Hook 中完成；View 组件通过调用对应 Hook 获取状态与操作函数，只负责渲染与事件转发。

**页面级补充（Wave 3.1）**：
- `app/(app)/invoices/page.tsx` 必须通过 `useInvoicesPageController` 获取列表展示所需逻辑（筛选、导出、动作守卫、Explorer 链接）；**列表页发票卡片（`components/invoice-card.tsx`）不展示 line items**
- `app/(app)/invoices/create/page.tsx` 必须通过 `controller/Invoice/useCreateInvoicePage` 获取页面展示配置，保持 page 文件为纯 View
- `app/(app)/invoices/[id]/page.tsx` 必须通过 `useInvoiceDetailPage(invoiceHash)` 获取详情数据、锚点、displayCurrency、审计包下载等，页面仅负责渲染，不直接使用 `useInvoiceDetail` + registry/anchors 等内联逻辑；**详情页为 line items 唯一展示位置**：以表格形式展示 line items，且每行显示该商品税率（Tax Rate 列，支持发票级或逐行税率）
- `app/(app)/receipts/page.tsx` 的链上扫描入口由 `useReceipts` 提供，`PaymentRecord` 不再由发票列表页承担

### 6.1 发票创建表单组件

> 文件：`components/invoice-form.tsx`  
> 实现状态：✅ 已重构为纯 View

```typescript
/**
 * InvoiceForm 无需外部 Props，内部调用 useInvoiceForm() 获取全部状态。
 * 组件仅包含 JSX 渲染，不含任何业务逻辑、计算或副作用。
 *
 * View 层职责边界：
 * - 受控输入绑定（value / onChange → form.setXxx）
 * - 错误消息展示（form.errors）
 * - 进度条渲染（form.isProcessing / form.currentProgress / form.currentLog）
 * - 将原始事件转发给 form.handleSubmit
 * - 不做任何值转换、校验或 API 调用
 *
 * 与 JctPdfPreview 的数据流：
 * - lineItems  ← form.jctPreviewData.lineItemsV3
 * - summary    ← form.jctPreviewData.summary
 * - sellerName ← form.publicKey（截断显示，纯展示）
 *
 * 注：Standard 模式（isJctMode 切换）与整单 Tax rate (%) 字段已移除
 *
 * 组件向 onSubmit 传递的 CreateInvoiceParams 必须包含（全部必填）：
 * - taxGroups（由组件内部从 lineItems 聚合，始终计算）
 * - taxTag（通过 useCryptoService().hashTaxGroups() 异步计算）
 * - jctRegistration（通过 useCryptoService().hashTNumber() 异步计算）
 * - currencyFlag（来自货币选择器）
 * - tNumber（始终必填）
 */
```

### 6.2 JCT PDF 预览组件（🆕）

> 文件：`components/jct-pdf-preview.tsx`（新文件）

```typescript
export interface JctPdfPreviewProps {
  /** 实时从左侧表单同步的数据 */
  sellerName:       string;
  sellerTNumber:    string;       // T + 13 位
  buyerName:        string;
  issueDate:        Date;
  lineItems:        LineItemV3[];
  /** 计算好的税额汇总 */
  summary: {
    net10:  number;  // 10% 税率合计（税前）
    tax10:  number;  // 10% 税额
    net8:   number;  // 8% 税率合计（税前）
    tax8:   number;  // 8% 税额
    total:  number;  // 总计（含税）
  };
}

/**
 * 渲染要求（NTA 六要素）：
 * 1. 发行者标识：sellerName + "登録番号 T" + sellerTNumber
 * 2. 交易日期：issueDate（YYYY年MM月DD日）
 * 3. 内容明细：8% 税率行自动追加 ※ 记号
 * 4. 税率分类汇总：10% 合计 / 8% 合计（不含税/含税分列）
 * 5. 确切税额：10% 消費税 / 8% 消費税（备注 ※ 为軽減税率）
 * 6. 受票者标识：buyerName
 */
```

### 6.3 支付进度组件（🆕）

> 文件：`components/payment-progress.tsx`（新文件）

```typescript
/** 三阶段支付进度条 Props */
export interface PaymentProgressProps {
  /** 当前货币模式 */
  currencyFlag:      CurrencyFlag;
  /** USDCx 授权状态（Phase 1，仅 USDCx 路径显示） */
  approvalStatus:    'idle' | 'checking' | 'insufficient' | 'approved';
  /** 当前阶段（null = 未开始，1/2/3） */
  phase:             1 | 2 | 3 | null;
  /** 链上确认深度（Phase 3 显示） */
  confirmationDepth: number;
  /** 是否完成 */
  isComplete:        boolean;
}
```

### 6.4 Dashboard 财务磁贴（🔧 修改）

> 文件：`app/(app)/dashboard/page.tsx`

```typescript
/**
 * Dashboard 使用 useInvoices() 返回的派生数据：
 * - totalAccountPayable  → "Account Payable" 磁贴
 * - totalPaidThisMonth   → "Total Paid" 磁贴
 * - jctDeductibleAmount  → "JCT Deductible" 磁贴
 * - currencyDistribution → 资产比例饼图（Credits vs USDCx）
 * - taxTrend             → 税务趋势折线图（6 个月）
 *
 * 审计包监控：
 * - 从 AuditLogStore（已有）读取已发放 Audit Key 列表
 * - 展示 expiresAt 倒计时
 */
```

### 6.5 审计中心组件（🔧 扩展）

> 文件：`app/(app)/audit/page.tsx`  
> ⚠️ **架构清理**：`<AuditKeyGenerator />` 为 Wave 2 遗留组件，已从此页面移除。Wave 3 审计完整流程由 `<AuditCenterV3 />` 统一承担。

```typescript
/**
 * audit/page.tsx 页面结构（Wave 3）：
 *
 * 1. 页头（标题 + 说明 + 吉祥物图）
 * 2. 「Verify Audit Package」跳转链接（→ /audit/verify）
 * 3. <AuditCenterV3 />   ← 所有者端：角色选择 + Record 列表 + 生成包
 *
 * 移除项：<AuditKeyGenerator />（Wave 2 遗留，不再需要）
 *
 * AuditCenterV3 内部通过 useAuditPackageGenerate() 获取：
 * - role / setRole()                  → 角色选择（buyer / seller）
 * - availableRecords / toggleRecord() → Record 列表多选
 * - selectionSummary                  → 底部授权抽屉（总数 / 金额 / 税额）
 * - expiresAt / setExpiresAt()        → 有效期日历选择器
 * - generate()                        → 生成并下载 JSON + Audit Key
 * - submitOnChainAuthorization()      → [可选] 提交链上授权
 */
```

> 文件：`app/(app)/audit/verify/page.tsx`

```typescript
/**
 * 审计员端（verify 页）通过 useAuditPackageVerify() 获取：
 * - importEnvelope()          → 导入 JSON 包（文件拖拽 / 粘贴）
 * - auditKey / setAuditKey()  → 输入 Audit Key
 * - detectedRole              → 自动识别角色（buyer / seller）
 * - runVerification()         → 启动三步流水线（Step 1 → 2 → 3 依次执行，结果实时更新）
 * - verificationResult        → Step 1/2/3 分阶段结果（含 ok、detail、链上数据）
 * - allStepsPassed            → 激活「导出 PDF 报告」按钮的前提条件
 * - exportPdfReport()         → 导出合规判定 PDF 报告
 */
```

---

## 7. 错误类型扩展

> 文件：`lib/service-errors.ts`（按需追加）

```typescript
/** 🆕 Wave 3 新增 Protocol 错误码 */
export enum ProtocolError {
  // ✅ 现有（略）
  USDCX_INSUFFICIENT_ALLOWANCE = 'USDCX_INSUFFICIENT_ALLOWANCE',  // 授权额度不足
  USDCX_APPROVE_FAILED         = 'USDCX_APPROVE_FAILED',           // Approve TX 失败
  NTA_API_UNAVAILABLE          = 'NTA_API_UNAVAILABLE',             // NTA T 号码 API 不可用（可降级）
  EXPLORER_API_UNAVAILABLE     = 'EXPLORER_API_UNAVAILABLE',        // Aleo Explorer API 不可用
}

/** 🆕 Wave 3 新增 Crypto 错误码 */
export enum CryptoError {
  // ✅ 现有（略）
  INVALID_T_NUMBER       = 'INVALID_T_NUMBER',         // T 号码格式错误（非 13 位数字）
  TAX_TAG_MISMATCH       = 'TAX_TAG_MISMATCH',         // tax_tag 验证 B 失败
  TAX_AMOUNT_MISMATCH    = 'TAX_AMOUNT_MISMATCH',      // tax_tag 验证 A 失败
  TOTAL_AMOUNT_MISMATCH  = 'TOTAL_AMOUNT_MISMATCH',    // tax_tag 验证 C 失败
}
```

---

## 8. 跨层数据流速查表

| 操作 | View | Controller | Service | Model |
|------|------|-----------|---------|-------|
| **创建发票**（JCT-only） | InvoiceForm 收集 lineItems + tNumber（始终为 JCT 流程，无 Standard 分支） | useTransactionController.executeCreateInvoice → 无条件调用 hashTaxGroups / hashTNumber | CryptoService.hashTaxGroups / hashTNumber → WalletService.requestTransaction | InvoiceStore.addInvoice（含 taxTag、taxGroups） |
| **Credits 私有支付** | 支付按钮 → executePay | useTransactionController.executePay → phase 状态机；生成 payment_nonce；获取 credits.aleo/credits record | WalletService.requestTransaction(pay_invoice_credits_private，传入 credits record + nonce) | InvoiceStore.markInvoiceSending → ReceiptStore.addReceipt（含 settlementAnchor=commitment、nonce） |
| **USDCx 支付** | 支付按钮 → executePay（无 Approve 步骤） | useTransactionController.executePay → 直接调用 pay_invoice_usdcx（transfer_public_as_signer）；生成 payment_nonce | WalletService.requestTransaction(pay_invoice_usdcx) | 同上 |
| **生成审计包（买家）** | 审计中心选择 PaymentRecord → generate | useAuditPackageGenerate.generate（role=buyer） | AuditService.generateV3（密文含 settlement_anchor + payment_nonce，供 Step 2 承诺验证） | 读 ReceiptStore（含 settlementAnchor、nonce） |
| **生成审计包（卖家）** | 审计中心选择 PAID InvoiceRecord → generate | useAuditPackageGenerate.generate（role=seller） | AuditService.generateV3（密文含 TaxGroups → tax_groups_ciphertext，jct_registration_hint） | 读 InvoiceStore |
| **审计验证 Step 1** | Step 1 结果展示 | useAuditPackageVerify.runVerification | registry.getInvoiceJctReg → 比对 BHP256(tNumber)；NTA API（可降级） | （只读） |
| **审计验证 Step 2** | Step 2 结果展示 | 同上 | 读包内 settlementAnchor + nonce → 本地重算 BHP256(invoice_id‖amount‖nonce) → 验证 = settlementAnchor → registry.getPaymentCommitment(settlementAnchor)（验证 invoice_id） | （只读） |
| **审计验证 Step 3** | Step 3 结果展示 + PDF 导出 | 同上 | 解密 tax_groups_ciphertext → registry.getInvoiceTaxTag → crypto.verifyTaxTag A/B/C | （只读） |
| **Dashboard 指标** | 展示磁贴 / 图表 | useInvoices（派生 jctDeductibleAmount 等） | （无 Service 调用，纯内存聚合） | InvoiceStore.getAllInvoices |

---

## 9. 实现顺序建议（可并行）

以下各 Track 可独立分配给不同 Agent，接口已在本文件完整定义：

| Track | 涉及文件 | 前置依赖 | 状态 |
|-------|---------|---------|------|
| **A: 类型基础** | `lib/types.ts`、`lib/contract.ts` | 无 | ✅ 已完成（需更新 PROGRAM_ID_V3 → v3_1、MAPPINGS 新增 payment_commitments） |
| **A2: Wave 3.1 合约升级** | `src/main.leo`（新 `zk_invoice_v3_1.aleo`）、`program.json` | 无 | 🔧 待完成：import `test_usdcx_stablecoin.aleo`；新增 `pay_invoice_credits_private`；`pay_invoice_usdcx` 改 `transfer_public_as_signer`；新增 `payment_commitments` mapping；`leo build` 验证 |
| **B: CryptoService** | `services/CryptoService/ICryptoService.ts` + Impl | Track A | ✅ 已完成（新增 `hashPaymentCommitment(invoice_id, amount, nonce)` 供 Step 2 本地验证） |
| **C: AleoProtocolService** | `services/AleoProtocolService/IAleoProtocolService.ts` + Impl | Track A | ✅ 已完成（Wave 3.1：移除 `getUsdcxAllowance`） |
| **C2: InvoiceRegistryService** | `services/InvoiceRegistryService/IInvoiceRegistryService.ts` + Impl | Track A | 🔧 需更新：新增 `getPaymentCommitment`（查 `payment_commitments` mapping）；`getInvoiceTxId` 标记 deprecated |
| **D: AuditService** | `services/AuditService/IAuditService.ts` + Impl | Track A + B | 🔧 需更新：Step 2 改为承诺验证（本地重算 + `getPaymentCommitment`） |
| **E: Model Store** | `stores/Invoice/InvoiceState.ts`、`stores/Receipt/` | Track A | 🔧 需更新：ReceiptStore 新增 `paymentNonce` 字段持久化 |
| **F: Controller — 表单** | `controller/Invoice/useInvoiceForm.ts` | Track A | ✅ 已完成 |
| **G: Controller — 支付** | `controller/Transaction/useTransactionController.ts` | Track A2 | 🔧 需更新：Credits 路径传入 `credits.aleo/credits` record；USDCx 路径移除 Approve 步骤；生成并持久化 `payment_nonce` |
| **H: Controller — 发票扫描** | `controller/Invoice/useInvoiceChainScan.ts`、`useInvoicePollingCore.ts` | Track A+C | ✅ 已完成 |
| **I: Controller — 审计** | `controller/Audit/useAuditPackageGenerate.ts`、`useAuditPackageVerify.ts` | Track A+C2+D | 🔧 需更新：审计包密文新增 `payment_nonce`；Step 2 验证改为承诺机制 |
| **J: View — 创建表单 + PDF** | `components/invoice-form.tsx`、`components/jct-pdf-preview.tsx` | Track F | ✅ 已完成（纯 View） |
| **K: View — Dashboard** | `app/(app)/dashboard/page.tsx` | Track E+H | ✅ 已完成 |
| **L: View — 审计中心** | `app/(app)/audit/page.tsx`、`verify/page.tsx` | Track I | ✅ 已完成（Step 2 UI 展示逻辑需配合 D 更新） |
| **M: Testnet 部署 & 验收** | `.env`、`docs/ARCHITECTURE.md` | Track A2 部署完成 | 🔧 待完成（v3_1 部署 + 端到端验证 + ARCHITECTURE.md 更新）|

---

*文档版本：Wave 3.1 SPEC v2.0 — 更新于 2026-02-26（隐私支付路径升级：Credits private transfer + test_usdcx_stablecoin.aleo + 承诺审计机制）*
