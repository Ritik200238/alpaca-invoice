# Alpaca Invoice (ZK-Invoice) — Wave 4 产品需求文档 (PRD)

| 字段 | 内容 |
|------|------|
| **项目名称** | Alpaca Invoice (ZK-Invoice) |
| **版本阶段** | Wave 4 — 全链路支付 + 国际化 + 商业纠纷治理 + ZK 信用体系 |
| **目标市场** | 日本 (Japan)，兼顾全球化扩展 |
| **前序版本** | Wave 3.1（JCT 合规 + Credits 私有支付 + 承诺审计） |
| **当前合约** | `zk_invoice_v3_1.aleo`（Testnet，`@noupgrade`） |
| **文档状态** | Draft v1.0 |
| **最后更新** | 2026-03-19 |

---

## 目录

- [1.0 Wave 4 概述](#10-wave-4-概述)
- [2.0 Feature A — USDCx 支付路径打通](#20-feature-a--usdcx-支付路径打通)
- [3.0 Feature B — 日语 (ja) 国际化](#30-feature-b--日语-ja-国际化)
- [4.0 Feature C — 争议解决协议 (Dispute Resolution)](#40-feature-c--争议解决协议-dispute-resolution)
- [5.0 Feature D — 条件支付 / 交付确认支付 (Escrow)](#50-feature-d--条件支付--交付确认支付-escrow)
- [6.0 Feature E — ZK 信用证明 (ZK Credit Proof)](#60-feature-e--zk-信用证明-zk-credit-proof)
- [7.0 合约版本规划](#70-合约版本规划)
- [8.0 开发排期](#80-开发排期)
- [9.0 验收标准](#90-验收标准)

---

## 1.0 Wave 4 概述

### 1.1 背景与目标

Wave 3.1 完成了 JCT 合规引擎、Credits 全隐私支付和基于承诺哈希的审计体系。Wave 4 在此基础上解决以下核心问题：

| # | 问题 | 解决方案 |
|---|------|----------|
| A | USDCx 支付路径在前端被硬性阻断，无法使用稳定币结算 | 打通 freeze-list MerkleProof 获取，端到端完成 USDCx 私有支付 |
| B | 面向日本市场却无日文界面，降低用户转化率 | 引入 `next-intl`，实现日语/英语双语切换 |
| C | 发票争议只能线下沟通，无链上治理机制 | 新增 DISPUTED 状态 + 仲裁者角色 + 链上争议解决 |
| D | 大额 B2B 交易缺乏信任保障，"先款后货" vs "先货后款"无法调和 | 引入链上 Escrow 机制，交付确认后释放资金 |
| E | 企业的链上付款记录无法转化为可验证的商业信誉 | 基于 ZK 证明的信用评分系统 |

### 1.2 设计原则

1. **隐私优先**：所有新功能延续 Aleo 全隐私架构，敏感数据仅存在于 Records 中
2. **合约最小化升级**：Feature A 无需改合约；Feature C/D/E 需部署 `zk_invoice_v4.aleo`
3. **向后兼容**：保留 v3.1 合约的所有 mapping 读取能力，支持历史数据
4. **日本合规延续**：新功能不破坏 JCT 六要素合规性

---

## 2.0 Feature A — USDCx 支付路径打通

### 2.1 现状分析

**合约侧**：`zk_invoice_v3_1.aleo` 的 `pay_invoice_usdcx` 已完整实现，包括：
- 调用 `test_usdcx_stablecoin.aleo/transfer_private` 进行私有 Token 转账
- 接受 `[MerkleProof; 2]` freeze-list 合规证明
- 写入 `payment_commitments` mapping
- 返回 `ComplianceRecord` + 买卖方 Token records + PaymentRecord + InvoiceRecords

**前端侧**：`useTransactionController.ts` 第 484 行硬性抛出异常：
```
// TODO: fetch freeze-list proofs from network once API is available
throw new WalletServiceError(
  WalletError.UNAUTHORIZED,
  'USDCx private transfer requires freeze-list proofs; not implemented yet.'
);
```

**核心阻塞**：缺少 freeze-list MerkleProof 的获取逻辑。

### 2.2 技术方案

#### 2.2.1 MerkleProof 获取策略

`test_usdcx_stablecoin.aleo/transfer_private` 需要 `[MerkleProof; 2]` 参数。有两种获取路径：

**方案 A — 链上查询构建（推荐）**
1. 从 `test_usdcx_stablecoin.aleo` 的公开 mapping 中读取 freeze-list Merkle tree 状态
2. 在前端本地构建 MerkleProof（使用 `@provablehq/sdk` 的哈希工具）
3. 将构建好的 proof 传入 `pay_invoice_usdcx`

**方案 B — 默认空证明（Testnet 快速通道）**
1. 如果 testnet 上的 `test_usdcx_stablecoin.aleo` freeze-list 为空（即无被冻结地址）
2. 使用默认的空 MerkleProof（全零 sibling paths）
3. 适用于测试网快速验证，主网前需切换到方案 A

#### 2.2.2 实现步骤

**Step 1：调研 freeze-list 数据结构**
- 读取 `test_usdcx_stablecoin.aleo` 合约源码，确认 MerkleProof struct 定义
- 确认 freeze-list Merkle tree 的深度、叶子节点结构
- 确认 testnet 上当前 freeze-list 是否为空

**Step 2：实现 MerkleProof 构建服务**
- 在 `services/` 下新增 `FreezeListService/`
- 接口：`IFreezeListService.getMerkleProofs(payerAddress: string, payeeAddress: string): Promise<[MerkleProof, MerkleProof]>`
- 实现：查询链上 freeze-list mapping → 构建 Merkle tree → 为 payer/payee 生成非冻结证明

**Step 3：修改 useTransactionController**
- 移除第 484 行的 `throw` 阻断
- 在 USDCx 路径中调用 `FreezeListService.getMerkleProofs()`
- 构建完整的 `pay_invoice_usdcx` 参数列表

**Step 4：前端 UX 适配**
- `payment-progress.tsx` 增加 USDCx 路径的进度阶段
- Token Record 选择器：展示用户持有的 USDCx Token 余额
- 支付确认弹窗：显示 USDCx 金额 + 预估 gas

#### 2.2.3 前端交互流程

```
用户点击「Pay with USDCx」
       │
       ▼
┌─────────────────────────┐
│ Phase 1: Token 准备      │
│ - 获取用户 Token records │
│ - 检查余额是否充足       │
│ - 获取 freeze-list proofs│
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Phase 2: ZK 证明生成     │
│ - 本地 Proving           │
│ - 显示隐私盾牌动效       │
│ - 「请勿关闭浏览器」     │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Phase 3: 链上确认        │
│ - 广播交易              │
│ - 等待 finalize          │
│ - 显示确认深度           │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ 完成                     │
│ - 买方获得 PaymentRecord │
│ - 买方获得找零 Token     │
│ - 卖方获得 PAID Invoice  │
│ - 卖方获得收款 Token     │
└─────────────────────────┘
```

#### 2.2.4 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `services/FreezeListService/IFreezeListService.ts` | 新增 | 接口定义 |
| `services/FreezeListService/FreezeListServiceImpl.ts` | 新增 | MerkleProof 构建逻辑 |
| `controller/Transaction/useTransactionController.ts` | 修改 | 打通 USDCx 支付路径 |
| `components/payment-progress.tsx` | 修改 | 新增 USDCx 阶段展示 |
| `components/invoice-form.tsx` | 修改 | 货币选择器 UX 优化 |
| `lib/contract.ts` | 修改 | 新增 USDCx 相关常量 |

---

## 3.0 Feature B — 日语 (ja) 国际化

### 3.1 业务背景

Alpaca Invoice 面向日本 JCT 合规市场，但当前所有文案为英文硬编码。日语国际化是用户转化的核心门槛。

### 3.2 技术选型

| 方案 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| `next-intl` | Next.js 14 App Router 原生支持，SSR/SSG 友好 | 学习曲线稍高 | **推荐** |
| `react-i18next` | 社区最大，生态丰富 | App Router 集成需额外配置 | 备选 |
| `next-translate` | 配置简单 | 维护频率低 | 不推荐 |

**选型**：`next-intl`（v4.x），原因：
- 与 Next.js 14 App Router 深度集成
- 支持服务端组件翻译（Server Components）
- 内置日期、数字、货币格式化
- 支持 ICU 消息格式（复数、选择等）

### 3.3 实现方案

#### 3.3.1 目录结构

```
messages/
├── en.json          # 英语（默认）
└── ja.json          # 日语
i18n/
├── config.ts        # 语言配置
├── request.ts       # 服务端国际化
└── navigation.ts    # 导航国际化
app/
└── [locale]/        # 语言化路由
    ├── (app)/
    │   ├── dashboard/
    │   ├── invoices/
    │   └── ...
    └── (landing)/
```

#### 3.3.2 翻译范围

**Phase 1 — 核心页面（MVP）**

| 页面/组件 | 预估 key 数量 | 优先级 |
|-----------|-------------|--------|
| Landing Page | ~50 | P0 |
| Dashboard | ~40 | P0 |
| Invoice List | ~35 | P0 |
| Invoice Create | ~60 | P0 |
| Invoice Detail | ~45 | P0 |
| Sidebar + Header | ~20 | P0 |
| Wallet Connect | ~15 | P0 |
| Error Messages | ~30 | P0 |
| **小计** | **~295** | |

**Phase 2 — 完整覆盖**

| 页面/组件 | 预估 key 数量 | 优先级 |
|-----------|-------------|--------|
| Audit Center | ~50 | P1 |
| Receipts | ~25 | P1 |
| Settings | ~20 | P1 |
| Onboarding | ~30 | P1 |
| Docs 页面 | ~40 | P2 |
| Chat Bot system prompt | ~10 | P2 |
| **小计** | **~175** | |

#### 3.3.3 翻译规范

**日语特殊考虑**：
- 金额格式：¥1,000,000（日元无小数位）
- 日期格式：2026年3月19日（年月日标注）
- 敬语层级：使用「です・ます」体（丁寧語），避免过于随意或过于正式
- JCT 术语：使用日本国税庁官方术语（適格請求書、登録番号、軽減税率 等）
- 按钮/操作：使用动词的连用形或命令形（作成する / 支払う / キャンセル）

**翻译 key 命名规范**：
```json
{
  "dashboard": {
    "title": "Dashboard",
    "stats": {
      "totalInvoices": "Total Invoices",
      "accountsPayable": "Accounts Payable"
    }
  },
  "invoice": {
    "create": {
      "title": "Create Invoice",
      "form": {
        "buyerAddress": "Buyer Address",
        "amount": "Amount"
      }
    }
  }
}
```

#### 3.3.4 语言切换 UX

- **位置**：Header 右上角，国旗图标 + 语言名下拉菜单
- **切换方式**：URL 路由切换 `/en/dashboard` ↔ `/ja/dashboard`，保持当前页面状态
- **默认语言**：根据浏览器 `Accept-Language` 自动检测，首次访问自动跳转
- **持久化**：cookie 存储用户偏好，下次访问自动使用

#### 3.3.5 JCT PDF 预览国际化

`jct-pdf-preview.tsx` 的 PDF 渲染需特殊处理：
- PDF 内容始终使用日语（JCT 法定要求）
- 字段标签：「発行者」「取引日」「品名」「税率区分」「消費税額」等
- 注脚：「※は軽減税率対象品目」（法定免责声明）
- 日期格式：令和X年 或 西暦（可选）

#### 3.3.6 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `messages/en.json` | 新增 | 英语翻译文件 |
| `messages/ja.json` | 新增 | 日语翻译文件 |
| `i18n/config.ts` | 新增 | next-intl 配置 |
| `i18n/request.ts` | 新增 | 服务端国际化 |
| `middleware.ts` | 新增 | 语言路由中间件 |
| `app/[locale]/` | 修改 | 所有页面迁移到 locale 路由下 |
| `components/header.tsx` | 修改 | 新增语言切换器 |
| 所有页面组件 | 修改 | 硬编码文案替换为 `t('key')` |

---

## 4.0 Feature C — 争议解决协议 (Dispute Resolution)

### 4.1 业务场景

| 场景 | 描述 | 当前处理 |
|------|------|----------|
| 金额争议 | 买方认为发票金额与约定不符 | 无 — 只能线下协商 |
| 交付争议 | 买方未收到货物/服务 | 无 — 无链上证据 |
| 质量争议 | 货物/服务质量不达标 | 无 — 无仲裁机制 |
| 重复开票 | 同一交易被重复开票 | 无 — 仅依赖链上 nonce 去重 |

### 4.2 角色模型

| 角色 | 职责 | 链上标识 |
|------|------|----------|
| **Seller（卖方）** | 创建发票，回应争议 | `invoice.seller` |
| **Buyer（买方）** | 支付发票，发起争议 | `invoice.buyer` |
| **Arbiter（仲裁者）** | 审查争议证据，做出裁决 | `dispute.arbiter`（可选） |

### 4.3 状态机设计

```
         create_invoice
              │
              ▼
        ┌───────────┐
        │  PENDING   │ (status = 0)
        └─────┬─────┘
              │
    ┌─────────┼─────────┐
    │         │         │
    ▼         ▼         ▼
┌───────┐ ┌──────┐ ┌──────────┐
│ PAID  │ │CANCEL│ │ DISPUTED │ (status = 4, 新增)
│ (1)   │ │ (2)  │ │          │
└───────┘ └──────┘ └────┬─────┘
                        │
              ┌─────────┼─────────┐
              │         │         │
              ▼         ▼         ▼
         ┌────────┐ ┌───────┐ ┌──────────────┐
         │RESOLVED│ │CANCEL │ │RESOLVED_PAID │
         │_CANCEL │ │ (2)   │ │    (6)       │
         │  (5)   │ │       │ │              │
         └────────┘ └───────┘ └──────────────┘
```

新增状态码：
- `STATUS_DISPUTED = 4u8` — 争议中
- `STATUS_RESOLVED_CANCELLED = 5u8` — 仲裁结果：取消
- `STATUS_RESOLVED_PAID = 6u8` — 仲裁结果：应支付（或调整金额后支付）

### 4.4 合约设计

#### 4.4.1 新增数据结构

```leo
struct DisputeData {
    invoice_id: field,
    disputant: address,       // 发起争议方（通常是 buyer）
    arbiter: address,         // 仲裁者地址（0 = 无仲裁者，双方自行协商）
    reason_hash: field,       // BHP256(争议理由文本)
    evidence_hash: field,     // BHP256(证据材料哈希)
    created_at: u32,
    resolution_deadline: u32  // 仲裁截止时间
}

record DisputeRecord {
    owner: address,
    dispute_id: field,
    invoice_id: field,
    disputant: address,
    arbiter: address,
    reason_hash: field,
    evidence_hash: field,
    status: u8,               // 0=OPEN, 1=RESOLVED_CANCEL, 2=RESOLVED_PAY
    created_at: u32,
    resolution_deadline: u32
}
```

#### 4.4.2 新增 Mappings

```leo
mapping dispute_registry: field => field;           // invoice_id => dispute_id
mapping dispute_status: field => u8;                // dispute_id => status
mapping dispute_resolution: field => field;         // dispute_id => resolution_hash
```

#### 4.4.3 新增 Transitions

**`raise_dispute`** — 买方发起争议
```
输入：InvoiceRecord (PENDING), reason_hash, evidence_hash, arbiter (可选), resolution_deadline
验证：caller == invoice.buyer, status == PENDING
输出：DisputeRecord (owner: buyer), DisputeRecord (owner: seller), DisputeRecord (owner: arbiter)
链上：invoice_status[id] = DISPUTED, dispute_registry[id] = dispute_id
```

**`resolve_dispute`** — 仲裁者/双方解决争议
```
输入：DisputeRecord, InvoiceRecord, resolution (u8: cancel/pay/adjust), adjusted_amount (可选)
验证：caller == arbiter || (caller == seller && 无仲裁者), 争议未超时
输出：更新后的 InvoiceRecord (RESOLVED_CANCELLED 或 RESOLVED_PAID)
链上：dispute_status[id] = resolution, invoice_status[id] = 对应状态
```

**`submit_evidence`** — 任一方提交补充证据
```
输入：DisputeRecord, new_evidence_hash
验证：caller == disputant || caller == seller
输出：更新 evidence_hash 的 DisputeRecord
链上：dispute_evidence_log[dispute_id] 追加哈希
```

### 4.5 前端交互设计

#### 4.5.1 发起争议

- **入口**：Invoice Detail 页，PENDING 状态下新增「Dispute / 異議申立」按钮（仅买方可见）
- **表单**：
  - 争议理由（下拉 + 文本框）：金额错误 / 未收到货物 / 质量问题 / 其他
  - 证据上传：文件哈希锚定（文件存本地/IPFS，哈希上链）
  - 仲裁者地址（可选）：指定第三方仲裁者的 Aleo 地址
  - 仲裁截止日期：默认 14 天
- **确认弹窗**：「发起争议后发票状态将变为 DISPUTED，在争议解决前无法支付或取消」

#### 4.5.2 争议管理面板

- **位置**：Sidebar 新增「Disputes / 紛争」导航项
- **列表视图**：所有相关争议（作为 buyer/seller/arbiter）
- **详情视图**：
  - 时间线展示：争议发起 → 证据提交 → 仲裁裁决
  - 证据列表：双方提交的证据哈希 + 验证状态
  - 操作按钮：提交证据 / 做出裁决（仲裁者）/ 接受裁决

#### 4.5.3 仲裁者视图

- 仲裁者通过审计包机制获取必要信息（发票详情、支付记录等）
- 裁决选项：
  - 「驳回争议 → 应支付」：发票恢复可支付状态
  - 「支持争议 → 取消发票」：发票状态变为 RESOLVED_CANCELLED
  - 「调整金额」：生成新发票替代原发票（合约层面 cancel old + create new）

### 4.6 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/main.leo`（v4 新合约） | 修改 | 新增 DisputeRecord, raise_dispute, resolve_dispute |
| `app/(app)/disputes/page.tsx` | 新增 | 争议列表页 |
| `app/(app)/disputes/[id]/page.tsx` | 新增 | 争议详情页 |
| `components/dispute-form.tsx` | 新增 | 发起争议表单 |
| `components/dispute-timeline.tsx` | 新增 | 争议时间线 |
| `controller/Dispute/useDisputeController.ts` | 新增 | 争议业务逻辑 |
| `stores/Dispute/useDisputeStore.ts` | 新增 | 争议状态管理 |
| `services/DisputeService/` | 新增 | 争议链上交互 |
| `lib/types.ts` | 修改 | 新增争议相关类型 |
| `components/sidebar.tsx` | 修改 | 新增 Disputes 导航项 |

---

## 5.0 Feature D — 条件支付 / 交付确认支付 (Escrow)

### 5.1 业务背景

B2B 交易中最大的信任困境：

```
卖方视角：「我先发货，万一买方不付款怎么办？」
买方视角：「我先付款，万一卖方不发货怎么办？」
```

**Escrow 机制**：买方将资金锁入链上托管 → 卖方交付 → 买方确认交付 → 资金释放。若超时或争议，资金可退回或由仲裁者决定。

### 5.2 Escrow 状态机

```
                create_invoice (escrow_enabled = true)
                         │
                         ▼
                   ┌───────────┐
                   │  PENDING   │
                   └─────┬─────┘
                         │
                         │ escrow_payment (买方锁入资金)
                         ▼
                   ┌───────────┐
                   │ ESCROWED  │ (status = 7, 新增)
                   │ 资金已锁定│
                   └─────┬─────┘
                         │
            ┌────────────┼────────────┐
            │            │            │
            ▼            ▼            ▼
    ┌──────────────┐ ┌────────┐ ┌──────────┐
    │confirm_deliv │ │timeout │ │ dispute  │
    │ (买方确认)   │ │ refund │ │ (争议)   │
    └──────┬───────┘ └────┬───┘ └─────┬────┘
           │              │           │
           ▼              ▼           ▼
      ┌─────────┐  ┌──────────┐ ┌──────────┐
      │  PAID   │  │ REFUNDED │ │ DISPUTED │
      │ 卖方收款│  │ 买方退款 │ │ 进入仲裁 │
      └─────────┘  └──────────┘ └──────────┘
```

新增状态码：
- `STATUS_ESCROWED = 7u8` — 资金已锁入链上托管
- `STATUS_REFUNDED = 8u8` — 超时退款（或仲裁退款）

### 5.3 合约设计

#### 5.3.1 新增数据结构

```leo
struct EscrowConfig {
    delivery_deadline: u32,    // 交付截止时间（超过后买方可取回）
    auto_release: bool,        // 是否到期自动释放给卖方（false = 退回买方）
    arbiter: address,          // 可选仲裁者
    release_condition_hash: field  // 交付条件描述的哈希（0field = 无条件）
}

record EscrowRecord {
    owner: address,            // 程序地址（资金托管方）
    escrow_id: field,
    invoice_id: field,
    payer: address,            // 买方
    payee: address,            // 卖方
    amount: u64,
    currency_flag: u8,
    delivery_deadline: u32,
    arbiter: address,
    status: u8                 // 0=LOCKED, 1=RELEASED, 2=REFUNDED
}
```

#### 5.3.2 新增 Transitions

**`escrow_payment_credits`** — 买方锁入 Credits
```
输入：credits record, InvoiceRecord (PENDING, escrow_enabled), EscrowConfig
验证：caller == buyer, amount >= total_amount
输出：EscrowRecord (LOCKED), InvoiceRecord (ESCROWED), credits 找零
链上：invoice_status[id] = ESCROWED, escrow_registry[id] = escrow_id
```

**`confirm_delivery`** — 买方确认交付，释放资金
```
输入：EscrowRecord (LOCKED), InvoiceRecord (ESCROWED)
验证：caller == buyer || caller == arbiter
输出：credits record (owner: seller), InvoiceRecord (PAID), PaymentRecord
链上：invoice_status[id] = PAID, payment_commitments 写入承诺
```

**`timeout_refund`** — 超时退款
```
输入：EscrowRecord (LOCKED)
验证：current_time > delivery_deadline, EscrowRecord.status == LOCKED
输出：credits record (owner: buyer), InvoiceRecord (REFUNDED)
链上：invoice_status[id] = REFUNDED
```

**`escrow_payment_usdcx`** — 买方锁入 USDCx（与 Credits 路径对称）

#### 5.3.3 Escrow 资金托管机制

Aleo 的 Record 模型天然适合 Escrow：
- `escrow_payment_credits` 消费买方的 credits record
- 资金"锁定"在 EscrowRecord 中（owner 为合约地址或特殊托管地址）
- `confirm_delivery` 消费 EscrowRecord，铸造新的 credits record 给卖方
- 全程隐私：外部观察者看不到 Escrow 的存在和金额

### 5.4 前端交互设计

#### 5.4.1 创建发票时启用 Escrow

- Invoice Create 表单新增「Enable Escrow / エスクロー有効化」开关
- 开启后展开配置面板：
  - 交付截止日期（默认 due_date + 7 天）
  - 超时策略：「退回买方」或「释放给卖方」
  - 仲裁者地址（可选）
  - 交付条件描述（文本，哈希上链）

#### 5.4.2 买方 Escrow 支付

- Invoice Detail 页，Escrow 发票显示「Lock Payment / 支払いをロック」按钮（替代普通 Pay）
- 支付流程与普通支付相似，但状态变为 ESCROWED 而非 PAID
- 付款后页面显示：
  - Escrow 状态卡片：锁定金额、交付截止时间倒计时
  - 「Confirm Delivery / 納品確認」按钮
  - 「Raise Dispute / 異議申立」按钮

#### 5.4.3 交付确认

- 买方点击「Confirm Delivery」后弹出确认对话框
- 「确认后资金将立即释放给卖方，此操作不可撤销」
- 确认后执行 `confirm_delivery` transition，状态变为 PAID

#### 5.4.4 超时退款

- 超过交付截止日期后，买方页面出现「Claim Refund / 返金請求」按钮
- 执行 `timeout_refund`，资金退回买方

### 5.5 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/main.leo`（v4 新合约） | 修改 | 新增 EscrowRecord, escrow_payment, confirm_delivery, timeout_refund |
| `components/invoice-form.tsx` | 修改 | 新增 Escrow 配置面板 |
| `components/escrow-status-card.tsx` | 新增 | Escrow 状态展示 |
| `controller/Escrow/useEscrowController.ts` | 新增 | Escrow 业务逻辑 |
| `services/EscrowService/` | 新增 | Escrow 链上交互 |
| `lib/types.ts` | 修改 | 新增 Escrow 相关类型和状态 |
| `components/payment-progress.tsx` | 修改 | 新增 Escrow Lock 阶段 |

---

## 6.0 Feature E — ZK 信用证明 (ZK Credit Proof)

### 6.1 业务价值

> 「我是一家可靠的企业，过去 6 个月按时支付了所有发票」
> —— 如何在不暴露任何发票细节的情况下证明这一点？

ZK 信用证明让企业将链上付款记录转化为可验证的商业信誉，而不泄露：
- 具体发票数量
- 交易对手方
- 金额明细
- 任何交易内容

### 6.2 信用维度

| 维度 | 说明 | 证明类型 |
|------|------|----------|
| **准时率** | 已付发票中按时支付的比例 | 范围证明：「准时率 ≥ X%」 |
| **交易量** | 一定时期内完成的交易总数 | 阈值证明：「交易量 ≥ N 笔」 |
| **交易额** | 一定时期内的累计支付总额 | 范围证明：「总额在 X-Y 范围内」 |
| **账龄** | 首笔交易距今时长 | 阈值证明：「使用 ≥ M 个月」 |
| **争议率** | 涉及争议的发票比例 | 范围证明：「争议率 ≤ X%」 |

### 6.3 技术方案

#### 6.3.1 数据源

信用证明的输入数据全部来源于链上已有的 mappings 和 Records：

```
链上可用数据：
├── invoice_count[address]           → 用户创建/收到的发票总数
├── audit_counter[address]           → 审计计数器
├── invoice_status[invoice_id]       → 每张发票的状态
├── payment_commitments[commitment]  → 支付承诺验证
└── Records (private)
    ├── InvoiceRecord[]              → 发票详情（paid_at, due_date, amount 等）
    └── PaymentRecord[]              → 支付详情（settlement_anchor, paid_at）
```

#### 6.3.2 合约设计

新增独立程序 `zk_credit_v1.aleo`（或作为 v4 合约的一部分）：

```leo
struct CreditProofInput {
    total_invoices: u64,         // 总发票数
    paid_on_time: u64,           // 按时支付数
    total_paid_amount: u64,      // 累计支付额
    first_invoice_date: u32,     // 首笔发票日期
    dispute_count: u64,          // 争议次数
    proof_generated_at: u32      // 证明生成时间
}

struct CreditClaim {
    claim_type: u8,              // 0=on_time_rate, 1=volume, 2=amount_range, 3=account_age, 4=dispute_rate
    threshold: u64,              // 声称的阈值（如准时率 >= 95%）
    period_start: u32,           // 统计周期开始
    period_end: u32              // 统计周期结束
}

record CreditProofToken {
    owner: address,
    proof_id: field,
    claim_hash: field,           // BHP256(CreditClaim)
    data_commitment: field,      // BHP256(CreditProofInput) — 不暴露原始数据
    is_valid: bool,
    generated_at: u32,
    expires_at: u32
}

mapping credit_proofs: field => field;  // proof_id => claim_hash (公开可验证)
```

#### 6.3.3 证明生成流程

```
用户（买方/卖方）发起信用证明请求
         │
         ▼
┌──────────────────────────────┐
│ Step 1: 本地数据收集          │
│ - 扫描本地 InvoiceRecords    │
│ - 扫描本地 PaymentRecords    │
│ - 统计各维度指标              │
│ (全部在客户端完成，不上传)    │
└───────────┬──────────────────┘
            │
            ▼
┌──────────────────────────────┐
│ Step 2: 生成 ZK 证明          │
│ - 构建 CreditProofInput      │
│ - 声明 CreditClaim           │
│ - 电路验证：                  │
│   ✓ paid_on_time / total     │
│     >= threshold (准时率)     │
│   ✓ total >= volume_claim    │
│   ✓ 数据与 Records 一致      │
│ - 生成 proof                  │
└───────────┬──────────────────┘
            │
            ▼
┌──────────────────────────────┐
│ Step 3: 链上锚定              │
│ - credit_proofs[proof_id]     │
│   = claim_hash                │
│ - 返回 CreditProofToken       │
│   (私有 Record)              │
└───────────┬──────────────────┘
            │
            ▼
┌──────────────────────────────┐
│ Step 4: 分享与验证            │
│ - 用户将 CreditProofToken    │
│   选择性展示给合作方          │
│ - 验证方查询链上 claim_hash   │
│ - 确认 proof_id 有效且未过期  │
└──────────────────────────────┘
```

#### 6.3.4 验证方式

验证方只需：
1. 获取 `proof_id`（由用户分享）
2. 查询链上 `credit_proofs[proof_id]` 获取 `claim_hash`
3. 确认 `claim_hash` 对应的 `CreditClaim` 内容（如"准时率 ≥ 95%"）
4. 无需知道用户的任何具体交易数据

### 6.4 前端交互设计

#### 6.4.1 信用证明生成器

- **位置**：Settings 页新增「Credit Proof / 信用証明」Tab
- **流程**：
  1. 选择证明类型（准时率 / 交易量 / 交易额 / 账龄）
  2. 设置阈值（如 "准时率 ≥ 90%"）
  3. 选择统计周期
  4. 本地扫描数据 + 生成预览（显示你的实际值是否满足声明）
  5. 提交链上生成 CreditProofToken
  6. 下载证明凭证 JSON（包含 proof_id + claim 描述）

#### 6.4.2 信用证明验证器

- **位置**：Verify 页新增「Credit Proof Verification」入口
- **输入**：对方分享的 proof_id 或凭证 JSON
- **验证结果**：
  - ✅ 「该用户声称准时付款率 ≥ 95%，此声明已通过 ZK 证明验证」
  - ❌ 「证明已过期 / proof_id 不存在」

#### 6.4.3 信用仪表盘

- Dashboard 新增「Credit Score / 信用スコア」卡片
- 显示用户自己的各维度指标（本地计算，不上链）
- 快速入口：「Generate Proof / 証明を生成」

### 6.5 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/zk_credit_v1.leo`（或合约扩展） | 新增 | 信用证明合约 |
| `app/(app)/settings/page.tsx` | 修改 | 新增 Credit Proof Tab |
| `app/(app)/verify/page.tsx` | 修改 | 新增信用证明验证入口 |
| `components/credit-proof-generator.tsx` | 新增 | 证明生成 UI |
| `components/credit-proof-verifier.tsx` | 新增 | 证明验证 UI |
| `components/credit-dashboard-card.tsx` | 新增 | Dashboard 信用卡片 |
| `controller/Credit/useCreditProof.ts` | 新增 | 信用证明业务逻辑 |
| `services/CreditService/` | 新增 | 信用数据收集 + 链上交互 |

---

## 7.0 合约版本规划

### 7.1 版本策略

由于 `zk_invoice_v3_1.aleo` 标记为 `@noupgrade`，新功能需部署新合约。

| 合约 | 变更 | 部署时机 |
|------|------|----------|
| `zk_invoice_v3_1.aleo` | **不变** — Feature A 仅需前端改动 | 已部署 |
| `zk_invoice_v4.aleo` | 新增 Dispute + Escrow 功能，继承 v3.1 所有能力 | Sprint 2 |
| `zk_credit_v1.aleo` | 独立信用证明合约，读取 v4 的 mappings | Sprint 3 |

### 7.2 v4 合约新增内容摘要

```
zk_invoice_v4.aleo
├── 继承 v3.1 所有 structs, records, transitions, mappings
├── 新增 STATUS_DISPUTED (4), STATUS_RESOLVED_CANCELLED (5),
│   STATUS_RESOLVED_PAID (6), STATUS_ESCROWED (7), STATUS_REFUNDED (8)
├── 新增 DisputeRecord, DisputeData
├── 新增 EscrowRecord, EscrowConfig
├── 新增 transitions:
│   ├── raise_dispute
│   ├── resolve_dispute
│   ├── submit_evidence
│   ├── escrow_payment_credits
│   ├── escrow_payment_usdcx
│   ├── confirm_delivery
│   └── timeout_refund
└── 新增 mappings:
    ├── dispute_registry
    ├── dispute_status
    ├── dispute_resolution
    └── escrow_registry
```

### 7.3 数据迁移

- v3.1 的已有发票数据不受影响（独立合约）
- 前端新增 `NEXT_PUBLIC_PROGRAM_ID_V4` 环境变量
- 新发票使用 v4 合约创建
- 历史发票仍通过 v3.1 读取和操作

---

## 8.0 开发排期

### 8.1 整体时间线

| Sprint | 时间 | 功能 | 依赖 |
|--------|------|------|------|
| **Sprint 1** | 第 1-2 周 | Feature A (USDCx) + Feature B Phase 1 (i18n 核心页面) | 无 |
| **Sprint 2** | 第 3-4 周 | Feature C (Dispute) + Feature D (Escrow) 合约 + 前端 | 需部署 v4 合约 |
| **Sprint 3** | 第 5-6 周 | Feature E (ZK Credit) + Feature B Phase 2 (i18n 完整) | 需部署 credit 合约 |

### 8.2 Sprint 1 详细排期

| 天数 | 任务 | 产出 |
|------|------|------|
| Day 1 | 调研 `test_usdcx_stablecoin.aleo` freeze-list 结构 | MerkleProof 构建方案文档 |
| Day 2-3 | 实现 FreezeListService + 修改 useTransactionController | USDCx 支付端到端可用 |
| Day 4 | USDCx 支付 UX 适配（progress, token selector） | 支付流程完整 |
| Day 5 | 引入 next-intl + 项目结构改造 + middleware | i18n 基础设施就绪 |
| Day 6-7 | 抽取文案 + 英语翻译文件 | `messages/en.json` 完成 |
| Day 8-9 | 日语翻译 + JCT PDF 日语化 | `messages/ja.json` 核心页面完成 |
| Day 10 | 语言切换 UX + 测试验收 | Sprint 1 交付 |

### 8.3 Sprint 2 详细排期

| 天数 | 任务 | 产出 |
|------|------|------|
| Day 1-3 | 编写 zk_invoice_v4.aleo (Dispute + Escrow) | 合约通过本地测试 |
| Day 4 | 部署 v4 合约到 Testnet | 链上可用 |
| Day 5-6 | Dispute 前端：disputes 页面 + 表单 + controller | 争议发起和管理 |
| Day 7-8 | Escrow 前端：表单扩展 + escrow-status + controller | 条件支付完整流程 |
| Day 9-10 | 集成测试 + 端到端验收 | Sprint 2 交付 |

### 8.4 Sprint 3 详细排期

| 天数 | 任务 | 产出 |
|------|------|------|
| Day 1-2 | 编写 zk_credit_v1.aleo | 信用证明合约 |
| Day 3 | 部署 + 前端 CreditService | 链上信用证明可用 |
| Day 4-5 | 信用证明生成器 + 验证器 UI | 前端完整 |
| Day 6-7 | i18n Phase 2：Audit, Settings, Onboarding 日语化 | 完整日语覆盖 |
| Day 8 | Credit Dashboard 卡片 + 集成 | 仪表盘增强 |
| Day 9-10 | 全流程回归测试 + 文档更新 | Wave 4 完整交付 |

---

## 9.0 验收标准

### Feature A — USDCx 支付

- [ ] 买方可使用 USDCx Token 私有 Record 支付发票
- [ ] MerkleProof 自动获取，无需用户手动输入
- [ ] 支付完成后买方获得 PaymentRecord + 找零 Token
- [ ] 卖方获得 PAID InvoiceRecord + 收款 Token
- [ ] payment_commitments mapping 正确写入承诺哈希
- [ ] 支付进度 UI 与 Credits 路径体验一致

### Feature B — 日语国际化

- [ ] 支持 `/ja/` 和 `/en/` 双语路由
- [ ] 浏览器语言自动检测 + cookie 持久化
- [ ] Header 语言切换器功能正常
- [ ] P0 核心页面日语翻译完整（295+ keys）
- [ ] JCT PDF 预览使用日语标签和格式
- [ ] 金额格式化：¥ 前缀、千分位、无小数位
- [ ] 日期格式化：YYYY年M月D日

### Feature C — 争议解决

- [ ] 买方可对 PENDING 发票发起争议（状态变为 DISPUTED）
- [ ] 争议双方可提交证据（哈希锚定）
- [ ] 仲裁者可做出裁决（取消 / 应支付）
- [ ] 裁决执行后发票状态正确更新
- [ ] Disputes 管理页面功能完整
- [ ] 争议时间线展示清晰

### Feature D — 条件支付 Escrow

- [ ] 创建发票时可启用 Escrow 模式
- [ ] 买方可锁定资金（Credits / USDCx），状态变为 ESCROWED
- [ ] 买方可确认交付，资金释放给卖方，状态变为 PAID
- [ ] 超过 delivery_deadline 后买方可申请退款
- [ ] Escrow 状态卡片显示倒计时和操作按钮
- [ ] Escrow 流程的审计追踪完整

### Feature E — ZK 信用证明

- [ ] 用户可在本地扫描自己的交易记录统计各维度指标
- [ ] 用户可生成 ZK 证明（如"准时率 ≥ 90%"），不暴露任何具体数据
- [ ] CreditProofToken 链上锚定成功
- [ ] 第三方可通过 proof_id 验证信用声明
- [ ] 证明有有效期，过期后不可验证
- [ ] Dashboard 信用卡片展示本地指标

---

*End of Wave 4 PRD*
