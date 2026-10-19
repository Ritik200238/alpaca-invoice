Alpaca Invoice (ZK-Invoice) 产品需求文档 (PRD)
项目名称
Alpaca Invoice (ZK-Invoice)
版本阶段
Wave 3.1 - 日本合规 + 原生资产结算 + 隐私支付路径升级
目标市场
日本 (Japan)

1.0 项目概述
1.1 业务背景
自 2023 年 10 月起，日本正式推行《合格发票制度》(JCT)。企业申请消费税进项税抵扣必须持有包含 T + 13 位登记号的合规发票。
核心痛点：Web3 环境下资金流与信息流脱节；隐私链上存储多组税率数据的存储成本极高。
1.2 Wave 3 核心愿景
从"隐私存证工具"升级为"受监管的隐私金融网关"。
资产层：集成 credits.aleo 与 test_usdcx_stablecoin.aleo 实现发票与资产流转的原子化绑定。
合规层：通过 tax_tag 压缩技术实现低成本、高效率的多组税率合规审计。


2.0 业务流程设计 (Business Flow)
2.1 支付与结算流程 (Atomic Settlement)
2.1.1 范式演进：从"断层模式"到"原子结算"
旧逻辑 (Wave 2.2)：转账动作与发票状态变更相互独立。买家支付后可能因忘记点击"标记"或网络失败导致状态未更新，造成对账死循环。
新逻辑 (Wave 3.x)：利用 async/finalize 机制将资产划转指令嵌套在发票合约内。资产易主与状态变更在同一区块高度、同一 TX ID 下同步完成。

2.1.2 支付路径设计（Wave 3.1 隐私优先架构）

Wave 3.1 引入隐私优先支付路径，以「链上承诺哈希」代替「公开 TX 锚点」实现可审计性。

**Credits 路径（原生全隐私）**：调用 `credits.aleo/transfer_private`，以私有 Record 完成买家 → 卖家的资金转移，链上不留余额变动痕迹。合约在 `finalize` 阶段写入 `payment_commitment = BHP256(invoice_id ‖ amount ‖ nonce)` 至 `payment_commitments` mapping。审计时买家披露 `(invoice_id, amount, nonce)` → 审计员重算哈希 → 与链上 mapping 对比，完成数学确定性验证。

**USDCx 路径（Wave 3.1：全隐私）**：不再使用自建的 `usdcx_test_alpaca_v1.aleo`，改用链上官方测试代币 `test_usdcx_stablecoin.aleo`，并调用 `transfer_private`，以买家持有的私有 `Token` record 完成转账，链上同样不留余额变动痕迹。与 Credits 路径对称：`finalize` 阶段写入 `payment_commitment` 至 `payment_commitments` mapping；审计机制完全一致。注意：Token amount 类型为 `u128`，合约内须 `invoice.total_amount as u128` 强制转换。

**统一架构原则**：Credits 与 USDCx 均采用私有 Record 转账，买家须持有对应资产的私有记录（`credits.aleo/credits` 或 `test_usdcx_stablecoin.aleo/Token`）。两条路径的 ZK 审计机制、`settlement_anchor` 语义和 `payment_commitments` 写入逻辑完全一致。

**新合约版本**：`zk_invoice_v3_1.aleo` 已部署且 `@noupgrade`（最新 tx: at1kf9tl2vmd84398qrpzdrmtfkw2jdt4revyjlv2hmv5efg6rnegzqp3a0yp）。

2.2 JCT 合规判定与验证逻辑 (Compliance Judgment)
系统通过"身份+逻辑+事实"三层过滤确保发票法律效力：
身份合法性 (Identity)：卖家录入 T 号码后执行 BHP256 哈希锚定。审计时对比哈希，匹配即代表开票方身份合规。
多组税率计算完整性 (Logic - tax_tag 验证)：
电路逻辑：电路接收混合税率明细 TaxGroups 作为隐私输入。
验证 A：group.net_sum * rate_bps / 10000 == group.tax_sum，确保每组计税准确。
验证 B：BHP256(TaxGroups) == tax_tag，确保明细与链上指纹一致。
验证 C：sum(net_sum + tax_sum) == total_amount，确保支付总额与税率明细总和对齐。
交易真实性 (Fact)：利用原子结算绑定。只有官方资产合约确认扣款，发票才会被标记为 PAID。支付时合约在 `finalize` 阶段写入 `payment_commitment = BHP256(invoice_id ‖ amount ‖ nonce)` 至 `payment_commitments` mapping，同时将该承诺哈希固化进 PaymentRecord 的 `settlement_anchor` 字段，形成「隐私收据 ↔ 链上承诺 Mapping」双向可回溯的完整审计链路。买家凭 `(invoice_id, amount, nonce)` 向审计员证明支付真实性，无需暴露私钥或余额。



2.3 自动化"批量静默审计"流程 (Batch Silent Audit)
所有者端：根据角色（买家/卖家）在看板勾选相应类型的记录，设置自定义有效期，生成包含"明细承诺数据"的加密 JSON 包。
审计员端：导入包与密钥，终端开启并行流水线。
Step 1 验证身份；
Step 2 承诺验证（本地重算哈希 + 链上 payment_commitments mapping 比对）；
Step 3 运行本地电路，比对 tax_tag 并重算税务逻辑。

3.0 功能模块详情
3.1 原生资产结算层 (Multi-Asset Gateway)
3.1.1 多资产路由：根据发票 currency_flag 字段，自动调度 pay_invoice_credits_private（Credits）或 pay_invoice_usdcx（USDCx）接口。
3.1.2 资产准备：Credits 路径需买家持有 `credits.aleo/credits` 私有 Record；USDCx 路径需买家持有 `test_usdcx_stablecoin.aleo/Token` 私有 Record。两条路径均无需 Approve 步骤，均无公开余额变动。
3.1.3 结算凭证双向输出：支付成功后，买家获得 PaymentRecord（收据/收条），卖家获得 PAID 状态的 InvoiceRecord（已付发票凭证）。PaymentRecord 内含 settlement_anchor 字段（= payment_commitment 承诺哈希），买家持有 (invoice_id, amount, nonce) 即可独立完成审计回溯，无需依赖卖家提供任何额外信息。

3.1.4 USDCx 集成方案（Wave 3.1）

Wave 3.1 使用 Aleo 官方测试稳定币 `test_usdcx_stablecoin.aleo`，无需自建测试合约，采用**全隐私私有 Record 转账**路径。

**程序接口关键特性**（链上已部署，无需额外部署）：
- `record Token { owner: address, amount: u128 }`（私有 token 记录，金额类型 `u128`）
- `transfer_private(recipient, amount, token_record, proofs: [MerkleProof; 2]) -> (ComplianceRecord, Token, Token, Future)`：**Wave 3.1 主路径**，私有 Record 转账，需提供 freeze list MerkleProof，返回合规凭证 `ComplianceRecord`、`recipient_token`、`change_token` 及 Future（须在 finalize 中 await）；链上无余额变动痕迹
- `mapping balances: address => u128`（公开余额，仅 public 路径使用，Wave 3.1 不涉及）
- `transfer_public_as_signer / transfer_from_public`：公开路径，Wave 3.1 不使用

**Wave 3.1 USDCx 支付流程**：① 卖家创建 USDCx 发票（currency_flag=1）；② 买家确保持有足够的 `Token` 私有 Record，并从链上获取 freeze list `[MerkleProof; 2]`；③ 前端调用 `pay_invoice_usdcx`（传入 Token record + proofs）；④ 支付成功后买家获得 PaymentRecord（含 `settlement_anchor`）、找零 Token record 及 ComplianceRecord，卖家获得 PAID InvoiceRecord 及收款 Token record。

**金额类型注意**：合约内调用时须 `invoice.total_amount as u128`（u64 → u128 强制转换）。

**与 Credits 路径的差异**：Credits `transfer_private` 无 Future、无 MerkleProof、无 ComplianceRecord；USDCx `transfer_private` 需要 `[MerkleProof; 2]`（freeze list 合规），返回 `ComplianceRecord`，且有 Future 须 await。`settlement_anchor` 语义和审计机制完全一致。

**前端配置**：`.env` 中设置 `NEXT_PUBLIC_USDCX_PROGRAM_ID=test_usdcx_stablecoin.aleo`，`NEXT_PUBLIC_PROGRAM_ID=zk_invoice_v3_1.aleo`。

3.2 日本 JCT 合规引擎
3.2.1 混合税率处理：支持在同一张发票中并行处理 10%、8% 及未来任意比例的项目。
3.2.2 圆整规则：严格执行日本税务要求的"各税率汇总后单次取整"法定要求。
3.2.3 JCT 检查清单 (PDF 渲染 6 要素)：
发行者标识：卖方的姓名/名称及 T+13 位登记号码。
交易日期：清晰的年月日标注。
内容明细：对于轻课税（8%）项目，必须在项目名称前/后自动标注"※"记号。
税率分类汇总：必须分别列出 10% 和 8% 的合计金额（不含税/含税）。
确切税额：必须分别列出 10% 和 8% 对应的消费税具体金额，并备注："※为轻课税适用项目"。
受票者标识：买方的姓名或名称。




4.0 交互设计 (UX/UI)
4.1 发票创建页：向导式双栏布局 (WYSIWYG)
该页面核心目标是消除用户对"隐私不可见性"的焦虑。采用"左表单、右预览"的实时联动布局。
4.1.1 JCT 模式切换与视觉反馈
开关交互：页面顶部提供 "Standard" 与 "Japan JCT Compliance" 切换磁贴。
视觉重载：开启 JCT 模式后，界面强调色由"科技蓝"变为"合规金"，提示进入受监管的操作环境。
4.1.2 左侧：高兼容性 Item 级表单区
保留字段：完整保留 Wave 2.2 的 Order ID, Memo, Due date 等业务辅助字段。
JCT 登记号输入：在 Seller address 下方新增 T 号码字段。
实时校验：仅允许录入 13 位数字，输入时自动匹配模拟法人库，若格式正确则在字段右侧显示绿色盾牌。
多税率 Item 录入：
每一个商品行 (Line Item) 均配备 Tax Selector (10% / 8% / 0%)。
自动锁定：当用户选择税率后，对应的消费税金额由系统自动计算并进入"锁定灰度"状态，显示锁形图标。
4.1.3 右侧：实时合规预览区
PDF 实时渲染：用户在左侧输入的每一项数据，均会实时反映在右侧符合 NTA 规范的 PDF 画布上。
自动标注逻辑：
若某行选择了 8% 税率，预览区的该行商品名称自动追加 ※ 记号。
底部自动生成分类汇总表：10% 合计 | 10% 税金、8% 合计 | 8% 税金。
渲染法定免责声明脚注。
4.2 支付结算页：金融级确定性反馈
解决 ZK 证明生成耗时较长带来的体验断层。
4.2.1 智能支付按钮 (Asset Context)
Credits 模式：需从钱包获取私有 credits.aleo/credits Record，点击后进入 Proving 阶段，完成私有转账 + 承诺存证。
USDCx 模式（Wave 3.1 全隐私）：需从钱包获取私有 test_usdcx_stablecoin.aleo/Token Record，点击后进入 Proving 阶段，与 Credits 路径体验一致。
4.2.2 分阶段状态机进度条 (State Machine UI)
Phase 1: 资产准备：Credits 路径显示 credits Record 加载状态；USDCx 路径显示 Token Record 加载状态。
Phase 2: 证明生成 (Proving)：中心区域显示旋转的"隐私盾牌"动效，配以文本"正在本地生成零知识证明，请勿关闭浏览器"。
Phase 3: 广播确认 (Finalizing)：进度条由蓝转绿，实时显示 Aleo 链上确认深度（Confirmations）。


4.3 审计中心 (Audit Center)：专业审计终端
针对财务审计员设计的"三阶段流水线"核验交互。
4.3.1 所有者端：角色区分与批量打包
角色选择：进入中心时必须选择角色，决定操作的 Record 类型：
买家 (Buyer)：列表展示并勾选 PaymentRecord（支付凭证）。用于满足进项税抵扣审计。
卖家 (Seller)：列表展示并勾选状态为 PAID 的 InvoiceRecord（已付发票凭证）。用于满足销项税合规审计。
勾选与管理：支持多选。底部弹出"授权抽屉"，显示选中的 Record 总数、支付总金额及对应的税额汇总。
有效期设置：提供日历选择器，设定该审计授权包（Audit Pack）的失效时间。
密钥下发：生成包含所选 Record 密文和 Session Key 的 JSON 包，同时下发 Audit Key。
4.3.2 审计员端：自动化核验终端 (Validation Pipeline)
验证工作流：审计员导入 JSON 包与 Key 后，终端自动识别角色并运行三阶段验证：
身份锚点 (Identity)：扫描卖家 T 号码，通过 InvoiceRegistryService.getInvoiceJctReg 查询链上 jct_registration，比对哈希；验证通过时显示卖家企业合法注册信息。
资产核对 (Money Flow)：从买家 PaymentRecord 中读取 `settlement_anchor`（= 承诺哈希）；审计员结合买家披露的 `(invoice_id, amount, nonce)` 在本地重算 `BHP256(invoice_id ‖ amount ‖ nonce)`，验证与 `settlement_anchor` 一致；再通过 `InvoiceRegistryService.getPaymentCommitment(settlement_anchor)` 查询链上 `payment_commitments` mapping，确认 value = `invoice_id`，完成双向校验。Credits 路径因私有转账无链上余额痕迹，承诺验证即为唯一可信证明。
税务解密 (Tax Check)：解密 TaxGroups 密文，通过 InvoiceRegistryService.getInvoiceTaxTag 获取链上 tax_tag，本地重算并比对；利用本地 ZK 电路验证 A/B/C，确认明细逻辑与链上指纹一致。
结果反馈：核验成功后，激活"导出合规判定报告"按钮，生成 PDF 报告。
4.4 业务看板页 (Dashboard)：财务全景图
4.4.1 核心财务磁贴
Account Payable (AP)：展示所有 PENDING 进项发票的总额。
Total Paid：本月已原子结算成功的总资产。
JCT Deductible：通过 tax_tag 验证过的可抵扣进项税额总计。
4.4.2 可视化组件
资产比例饼图：展示 Credits 与 USDCx 的支付配比。
税务趋势折线图：展示过去 6 个月进项税额与销项税额的波动对比。
4.4.3 审计包监控：显示已发放的 Audit Key 列表，包含失效倒计时。




5.0 技术规格说明
5.1 数据结构扩展 (Leo)

5.0.1 Service 层职责边界（架构约束）
AleoProtocolService：通用 RPC 能力，包括 fee 估算、TX 提交、Record 链上验证。Wave 3.1 USDCx 路径使用 `transfer_public_as_signer`，无需 allowance 查询，`getUsdcxAllowance` 可移除。不承载任何发票业务 Mapping 查询。
InvoiceRegistryService：专门查询 `zk_invoice_v3_1.aleo` 合约的业务 Mapping，包括 Wave 2.2 原有的 getInvoiceStatus 等，以及 Wave 3 新增的 getInvoiceTaxTag（供审计 Step 3）、getInvoiceJctReg（供审计 Step 1）、getPaymentCommitment（供审计 Step 2，查询 payment_commitments mapping，key 为 settlement_anchor 承诺哈希）。`getInvoiceTxId` 已废弃（Wave 3.1 改用承诺机制）。

struct InvoiceRecord {
    owner: address,
    invoice_id: field,
    total_amount: u64,       // 发票总支付额 (Net_sum + Tax_sum)
    tax_tag: field,          // 核心：BHP256(所有税率分组明细的哈希)
    jct_registration: field, // BHP256(T_number)
    status: u8               // 0: PENDING, 1: PAID
}

PaymentRecord（Wave 3.1 修订版）新增 settlement_anchor: field 字段，存储支付承诺哈希 payment_commitment = BHP256(invoice_id ‖ amount ‖ nonce)。该字段是隐私收据与 payment_commitments 公共 Mapping 之间的唯一连接键：买家持有 (invoice_id, amount, nonce) 可随时向审计员证明支付真实性。payment_commitments Mapping 写入方向为 commitment => invoice_id，旧 invoice_tx_id Mapping 已废弃。


5.2 tax_tag 压缩算法规格
数据结构：TaxGroup { rate_bps: u32, net_sum: u64, tax_sum: u64 }；TaxGroups { group_a: TaxGroup (10%), group_b: TaxGroup (8%) }
压缩逻辑：链上仅存 tax_tag = BHP256(TaxGroups)（1 个 field）；明细在前端持有，审计时解密披露。
验证成本：链上存储恒定。审计员在本地终端还原明细并与指纹对比。

6.0 冲刺开发计划 (Wave 3.1)
天数
阶段
核心交付物
Day 1-3
合约升级
新建 zk_invoice_v3_1.aleo：Credits private transfer + USDCx transfer_public_as_signer + payment_commitments mapping。
Day 4-6
Service & Controller 层更新
InvoiceRegistryService 新增 getPaymentCommitment；AuditService Step 2 改为承诺验证；useTransactionController 更新支付路径。
Day 7-9
前端端到端验证
Credits private 支付 + USDCx 直接支付 + 审计承诺验证全流程。
Day 10
验收与验收演示
全流程 Demo。


7.0 验收标准
金融原子性：资产流转失败，发票状态保持 PENDING。
角色隔离审计：买家包内仅含 PaymentRecord，卖家包内仅含 PAID 状态的 InvoiceRecord。
JCT 合规性：PDF 预览样稿必须包含 NTA 要求的 6 要素，分类汇总逻辑准确。
承诺审计可验证性：审计员可独立重算 BHP256(invoice_id ‖ amount ‖ nonce) 与链上 payment_commitments mapping 完成 Step 2 验证。
