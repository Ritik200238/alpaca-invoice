export type AleoAddress = `aleo1${string}`;
export type AleoField = `${string}field`;
export type AleoTransactionId = `at1${string}`;
export type Microcredits = bigint;

export enum InvoiceStatus {
  PENDING = 0,
  PAID = 1,
  CANCELLED = 2,
  EXPIRED = 3,
  DISPUTED = 4,
  RESOLVED_CANCELLED = 5,
  RESOLVED_PAID = 6,
  ESCROWED = 7,
  REFUNDED = 8
}

/** 发票结算货币类型（对应合约 currency_flag: u8） */
export enum CurrencyFlag {
  CREDITS = 0,
  USDCX = 1
}

/**
 * 单个税率分组（对应合约 TaxGroup struct）
 * rate_bps: 税率基点，10% = 1000，8% = 800，0% = 0
 */
export interface TaxGroup {
  rate_bps: number;
  net_sum: bigint;
  tax_sum: bigint;
}

/**
 * 两档税率组合（对应合约 TaxGroups struct）
 * group_a: 10% 标准税率，group_b: 8% 轻课税税率
 */
export interface TaxGroups {
  group_a: TaxGroup;
  group_b: TaxGroup;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/** 前端表单中单个商品行（Wave 3 JCT，含税率） */
export interface LineItemV3 {
  description: string;
  quantity: number;
  unitPrice: number;   // 含税单价（JPY）
  taxRate: 0 | 8 | 10; // 选择税率（%）
  /** 系统自动计算，UI 锁定只读 */
  taxAmount?: number;
  /** 税前金额 = unitPrice * quantity / (1 + taxRate/100) */
  amount?: number;
}

export interface InvoiceDetails {
  invoiceNumber: string;
  orderId?: string;           // Optional; when omitted, use invoiceNumber for order_id derivation
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  notes?: string;
  /** Designated arbiter address for escrow disputes (set by seller at invoice creation) */
  arbiter?: string;
}

export interface Invoice {
  id: AleoField;
  seller: AleoAddress;
  buyer: AleoAddress;
  amount: Microcredits;
  taxAmount?: Microcredits;
  invoiceHash: AleoField;
  dueDate: Date;
  createdAt: Date;
  status: InvoiceStatus;
  orderId?: AleoField;
  currency?: AleoField;
  itemsHash?: AleoField;
  memoHash?: AleoField;
  details?: InvoiceDetails;
  nonce?: AleoField;      // create_invoice nonce, required for audit package
  auditKey?: string;      // 64 hex chars, generated at invoice creation
  metadata?: {
    confirmationStatus: 'SENDING' | 'CONFIRMED' | 'TIMEOUT';
    lastUpdated: Date;
    dataSource: 'local' | 'chain';
    action?: 'create' | 'cancel' | 'pay';
  };

  // Wave 3 JCT
  /** BHP256(TaxGroups) — 链上 tax_tag field */
  taxTag?: AleoField;
  /** BHP256(T_number as u64) — 链上 jct_registration field */
  jctRegistration?: AleoField;
  /** 发票总支付额 = net_sum + tax_sum（所有税率组之和） */
  totalAmount?: Microcredits;
  /** 结算货币 (0=Credits, 1=USDCx) */
  currencyFlag?: CurrencyFlag;
  /** JCT 模式下原始税率分组（用于本地 PDF 渲染，不上链） */
  taxGroups?: TaxGroups;
  /** JCT 登记号明文（13 位数字字符串） */
  tNumber?: string;
  /** Chain TX id where this invoice record was observed */
  transactionId?: AleoTransactionId;
  /** Chain block height where this invoice record was observed */
  blockHeight?: number;
}

export interface EncryptedPayload {
  iv: string;         // Initialization vector (Base64)
  ciphertext: string; // Ciphertext (Base64)
  authTag?: string;   // AES-GCM authentication tag (Base64) - Wave 2 required for tamper detection
}

/**
 * All computed values for create_invoice, including hash inputs and validation guards.
 * Replaces InvoiceHashContext. Use for both computeInvoiceHash context and chain submission.
 */
export interface InvoiceChainComputed {
  seller: AleoAddress;
  buyer: AleoAddress;
  dueDate: number;
  nonce: AleoField;
  orderIdField: AleoField;
  currencyField: AleoField;
  itemsHash: AleoField;
  memoHash: AleoField;
  invoiceHash: AleoField;
  lineItemsSum: bigint;
  expectedTotal: bigint;
  taxRateBps: bigint;
}

/**
 * Hash input for computeInvoiceHash / verifyInvoiceIntegrity.
 * When amount and taxAmount are provided, matches contract compute_invoice_hash_internal(seller, buyer, amount, tax_amount, due_date, nonce, order_id, currency, items_hash, memo_hash).
 */
export type InvoiceHashInput = Omit<
  InvoiceChainComputed,
  'invoiceHash' | 'lineItemsSum' | 'expectedTotal' | 'taxRateBps'
> & { amount?: bigint; taxAmount?: bigint };

/**
 * Contract-aligned 10 parameters for invoice hash. Mirrors main.leo InvoiceHashInput / compute_invoice_hash_internal.
 * Use for pure hash computation (no dependency on InvoiceDetails). Extensible when the program adds fields.
 */
export interface ContractInvoiceHashParams {
  seller: AleoAddress;
  buyer: AleoAddress;
  amount: bigint;
  taxAmount: bigint;
  dueDate: number;
  nonce: AleoField;
  orderId: AleoField;
  currency: AleoField;
  itemsHash: AleoField;
  memoHash: AleoField;
}

/** Chain context: the 8 fields that come from chain/creation; amount/tax come from details when building params. */
export type InvoiceHashChainContext = Omit<InvoiceHashInput, 'amount' | 'taxAmount'>;

export interface CreateInvoiceParams {
  buyer: AleoAddress;
  amount: Microcredits;
  dueDate: Date;
  details: InvoiceDetails;
  /** Optional audit params: when set, audit key is stored with invoice and set_audit_authorization is called after creation */
  audit?: {
    auditKey: string;
    scopesBitmask: bigint;
    expiresAt: number; // Unix seconds
  };
  // Wave 3 JCT (JCT-only: all required)
  taxGroups: TaxGroups;
  tNumber: string;
  currencyFlag: CurrencyFlag;
  /** Optional: if not provided, controller computes from taxGroups / tNumber */
  taxTag?: AleoField;
  jctRegistration?: AleoField;
}

export interface CreateInvoiceResult {
  transactionId: AleoTransactionId;
  invoiceId: AleoField;
  invoiceHash: AleoField;
  encryptedDetails: EncryptedPayload;
}

export interface PayInvoiceParams {
  invoiceId: AleoField;
  paymentRecord: string;
}

export interface PaymentResult {
  transactionId: AleoTransactionId;
  paymentId: AleoField;
  changeRecord?: string;
}

export interface PaymentReceipt {
  paymentId: AleoField;
  invoiceId: AleoField;
  payer: AleoAddress;
  payee: AleoAddress;
  amount: Microcredits;
  paidAt: Date;
  /** Wave 3: 链上 tx_id（Money Flow 审计） */
  txId?: AleoTransactionId;
  /** Wave 3: PaymentRecord.settlement_anchor（commitment hash），用于审计 Step 2 通过 payment_commitments 映射回溯 invoice_id */
  settlementAnchor?: AleoField;
}

export interface AuditKeyConfig {
  invoiceIds: AleoField[];
  permissions: string[];
  expiresAt: number;
}

export interface AuditKey {
  key: string;
  config: AuditKeyConfig;
  signature: string;
  issuedAt: number;
}

export interface AuditPackageV1 {
  version: 1;
  invoiceId: AleoField;
  invoiceHash: AleoField;
  permissions: string[];
  expiresAt: number;
  issuedAt: number;
  signerAddress: AleoAddress;
  cipher: EncryptedPayload;
  cipherHash: string;
  signature: string;
}

export interface AuditPackageV2 {
  version: 2;
  programId: string;
  invoiceId: AleoField;
  invoiceHash: AleoField;
  permissions: string[];
  expiresAt: number;
  issuedAt: number;
  signerAddress: AleoAddress;
  cipher: EncryptedPayload;
  cipherHash: string;
  signature: string;
  chainVerifiable: boolean;
}

export type AuditPackage = AuditPackageV1 | AuditPackageV2;

export interface ChainVerificationResult {
  invoiceExistsOnChain: boolean;
  hashMatchesChain: boolean;
  chainStatus: InvoiceStatus | null;
}

// ──────────────────────────────────────────────
// Wave 4: Dispute Resolution types
// ──────────────────────────────────────────────

export enum DisputeStatus {
  OPEN = 0,
  RESOLVED_CANCEL = 1,
  RESOLVED_PAY = 2
}

export interface DisputeRecord {
  disputeId: AleoField;
  invoiceId: AleoField;
  disputant: AleoAddress;
  arbiter: AleoAddress;
  reasonHash: AleoField;
  evidenceHash: AleoField;
  status: DisputeStatus;
  createdAt: Date;
  resolutionDeadline: Date;
  /** Plain-text reason kept locally (not on chain) */
  reasonText?: string;
}

export interface RaiseDisputeParams {
  invoice: Invoice;
  reasonHash: AleoField;
  evidenceHash: AleoField;
  arbiter?: AleoAddress;
  resolutionDeadlineDays: number;
  /** Original reason text (stored locally, not sent to chain) */
  reasonText?: string;
}

export interface ResolveDisputeParams {
  dispute: DisputeRecord;
  invoice: Invoice;
  resolution: DisputeStatus.RESOLVED_CANCEL | DisputeStatus.RESOLVED_PAY;
}

export interface SubmitEvidenceParams {
  dispute: DisputeRecord;
  newEvidenceHash: AleoField;
}

// ──────────────────────────────────────────────
// Wave 4: Escrow / Conditional Payment types
// ──────────────────────────────────────────────

export enum EscrowStatus {
  LOCKED = 0,
  RELEASED = 1,
  REFUNDED = 2
}

export interface EscrowConfig {
  deliveryDeadline: Date;
  autoRelease: boolean;
  arbiter?: AleoAddress;
  releaseConditionHash: AleoField;
}

export interface EscrowRecord {
  escrowId: AleoField;
  invoiceId: AleoField;
  payer: AleoAddress;
  payee: AleoAddress;
  amount: Microcredits;
  currencyFlag: CurrencyFlag;
  deliveryDeadline: Date;
  arbiter: AleoAddress;
  status: EscrowStatus;
}

export interface EscrowPaymentParams {
  invoice: Invoice;
  escrowConfig: EscrowConfig;
}

export interface ConfirmDeliveryParams {
  escrow: EscrowRecord;
  invoice: Invoice;
}

export interface TimeoutRefundParams {
  escrow: EscrowRecord;
  invoice: Invoice;
}

export interface ArbiterResolveParams {
  escrow: EscrowRecord;
  invoice: Invoice;
  decision: 'release' | 'refund';
}

// ──────────────────────────────────────────────
// Wave 4: ZK Credit Proof types
// ──────────────────────────────────────────────

export enum CreditClaimType {
  ON_TIME_RATE = 0,
  VOLUME = 1,
  AMOUNT_RANGE = 2,
  ACCOUNT_AGE = 3,
  DISPUTE_RATE = 4
}

export interface CreditClaim {
  claimType: CreditClaimType;
  threshold: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface CreditProofToken {
  proofId: AleoField;
  transactionId: string;
  claimHash: AleoField;
  dataCommitment: AleoField;
  isValid: boolean;
  generatedAt: Date;
  expiresAt: Date;
}

export interface CreditMetrics {
  totalInvoices: number;
  paidOnTime: number;
  onTimeRate: number;
  totalPaidAmount: bigint;
  firstInvoiceDate: number;
  disputeCount: number;
}

export interface CreditVerifyResult {
  isValid: boolean;
  claim: CreditClaim | null;
  proofId: AleoField | null;
  error?: string;
}

export type CreditGradeLetter = 'A+' | 'A' | 'B' | 'C' | 'D';

export interface CreditDimensionScores {
  onTimeRate: number;
  volume: number;
  amount: number;
  accountAge: number;
  disputeResistance: number;
}

export interface CreditGrade {
  letter: CreditGradeLetter;
  score: number;
  dimensions: CreditDimensionScores;
}
