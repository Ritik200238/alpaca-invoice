import { createServiceError } from '@/lib/service-errors';
import type { AleoAddress, AleoField, EncryptedPayload, Invoice, PaymentReceipt, TaxGroups } from '@/lib/types';
import type { AuditPackageEnvelope, AuditPackageEnvelopeV3 } from '@/types/audit-package';
import type { IInvoiceRegistryService } from '@/services/InvoiceRegistryService/IInvoiceRegistryService';
import type { IAleoProtocolService } from '@/services/AleoProtocolService/IAleoProtocolService';
import type { ICryptoService } from '@/services/CryptoService/ICryptoService';

/**
 * Audit package schema (versioned for forward compatibility)
 */
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

/**
 * V2.2: nonce + commitments (for auditor to recompute and verify against chain)
 * Wave 3: includes taxTag and jctRegistration for JCT compliance.
 */
export interface AuditPackageV2_2 {
  version: '2.2';
  programId: string;
  owner: AleoAddress;
  invoiceId: AleoField;
  invoiceHash: AleoField;
  permissions: string[];
  nonce: AleoField;
  cipher: EncryptedPayload;
  commitments: {
    root: AleoField;
    amount?: AleoField;
    taxAmount?: AleoField;
    dueDate?: AleoField;
    buyer?: AleoField;
    seller?: AleoField;
    currency?: AleoField;
    itemsHash?: AleoField;
    memoHash?: AleoField;
    orderId?: AleoField;
    /** Wave 3: BHP256 hash of TaxGroups struct */
    taxTag?: AleoField;
    /** Wave 3: BHP256 hash of T-number (13-digit JCT registration) */
    jctRegistration?: AleoField;
  };
  cipherHash: string;
  signature: string;
  expiresAt: number;
  issuedAt: number;
  chainVerifiable: boolean;
}

export type AuditPackage = AuditPackageV1 | AuditPackageV2 | AuditPackageV2_2;

/**
 * Audit service error codes
 */
export enum AuditError {
  NOT_CONNECTED = 'NOT_CONNECTED',           // Wallet not connected
  MISSING_MASTER_KEY = 'MISSING_MASTER_KEY', // Master key not available
  INVALID_INPUT = 'INVALID_INPUT',           // Invalid or missing input parameters
  INVOICE_NOT_FOUND = 'INVOICE_NOT_FOUND',   // Invoice not found in local storage
  MISSING_DETAILS = 'MISSING_DETAILS',       // Invoice details are missing
  INVALID_PACKAGE = 'INVALID_PACKAGE',       // Audit package validation failed
  GENERATION_FAILED = 'GENERATION_FAILED',   // Failed to generate audit package
  VALIDATION_FAILED = 'VALIDATION_FAILED',   // Failed to validate audit package
  SIGN_NOT_SUPPORTED = 'SIGN_NOT_SUPPORTED'  // Wallet does not support signMessage
}

/**
 * Audit service error class
 */
export const AuditServiceError = createServiceError<AuditError>('AuditService');
export type AuditServiceError = InstanceType<typeof AuditServiceError>;

/**
 * Generate audit package parameters.
 * Caller must pass the invoice (from local DB/chain) including nonce from invoice creation.
 */
export interface GenerateAuditPackageParams {
  /** Invoice from local DB/chain; must include `details` and `nonce` (from create_invoice). */
  invoice: Invoice;
  expiresAt: number;
  permissions: string[];
  /** When provided, use chain commitment root instead of local build (for auditor verification). */
  chainCommitmentRoot?: AleoField;
  /** When provided, use chain field commitments (snake_case keys). */
  chainFieldCommitments?: Record<string, AleoField>;
  /** When provided, use this audit key instead of generating a new one (from invoice creation). */
  auditKey?: string;
}

/**
 * Generate audit package result (envelope format + key material)
 */
export interface GenerateAuditPackageResult {
  /** New envelope JSON to share with auditor */
  envelope: AuditPackageEnvelope;
  /** Decryption key (hex); give to auditor separately */
  auditKey: string;
  /** Field hash of audit key for set_audit_authorization */
  auditKeyHash: AleoField;
}

/**
 * Validate audit package result
 */
export interface ValidateAuditPackageResult {
  valid: boolean;
  reason?: string;
  decrypted?: any;
  chainVerification?: {
    invoiceExistsOnChain: boolean;
    hashMatchesChain: boolean;
    chainStatus: any;
  };
}

/**
 * Protocol adapter for audit package verification (on-chain assertions).
 */
export interface AuditVerifyAdapter {
  assertRules: (invoiceId: AleoField, rulesHash: AleoField) => Promise<void>;
  assertAmount: (invoice: any, hash: AleoField, min: bigint, max: bigint) => Promise<void>;
  assertOwnership: (invoice: any, hash: AleoField, seller: string, buyer: string) => Promise<void>;
  assertCommitment: (invoiceId: AleoField, root: AleoField) => Promise<void>;
  assertCounter?: (seller: string, expected: bigint) => Promise<void>;
}

/**
 * Input for building field commitments.
 * Wave 3: includes taxTag and jctRegistration for JCT compliance.
 */
export interface BuildFieldCommitmentsInput {
  amount: bigint;
  taxAmount: bigint;
  dueDate: number;
  buyer: string;
  seller: string;
  currency: AleoField;
  itemsHash: AleoField;
  memoHash: AleoField;
  orderId: AleoField;
  nonce: AleoField;
  /** Wave 3: BHP256 hash of TaxGroups struct */
  taxTag: AleoField;
  /** Wave 3: BHP256 hash of T-number (13-digit JCT registration) */
  jctRegistration: AleoField;
}

/**
 * Input for generating an audit package (minimal disclosure with proofs/anchors).
 */
export interface GenerateAuditPackageInput {
  invoiceId: AleoField;
  invoiceHash: AleoField;
  rulesHash: AleoField;
  fieldCommitments: Record<string, AleoField>;
  commitmentsRoot: AleoField;
  auditKeyHash: AleoField;
  scopesBitmask: bigint;
  expiresAt: number;
  selectedFields: string[];
  payload: any;
  signature?: string;
  programId: string;
  version?: string;
}

/**
 * IAuditService interface
 * Responsibility: Encapsulate audit operations, handle generation and validation of audit packages
 *
 * Generate: caller passes invoice from local DB/chain (including nonce from create_invoice).
 * No getAllInvoices dependency; signing is done via injected signMessage.
 */
export interface IAuditService {
  /**
   * Generate audit package (envelope + audit key + auditKeyHash).
   * Caller must pass the invoice from local DB/chain, with details and nonce.
   *
   * @param params invoice, expiresAt, permissions, optional chain commitments
   * @returns envelope, auditKey, auditKeyHash
   */
  generate(params: GenerateAuditPackageParams): Promise<GenerateAuditPackageResult>;

  /**
   * Validate audit package
   * @param pkg Audit package to validate
   * @param auditKey Audit key for validation
   * @returns Validation result
   * @throws {AuditServiceError} May throw VALIDATION_FAILED
   */
  validate(pkg: AuditPackage, auditKey: string): Promise<ValidateAuditPackageResult>;

  /**
   * Build commitments root and field commitments aligned with contract tags.
   */
  buildFieldCommitments(input: BuildFieldCommitmentsInput): Promise<{ root: AleoField; fields: Record<string, AleoField> }>;

  /**
   * Generate audit package (minimal disclosure) with proofs/anchors.
   */
  generateAuditPackage(input: GenerateAuditPackageInput): Promise<any>;

  /**
   * Verify audit package by recomputing and calling on-chain anchors via provided protocol adapter.
   */
  verifyAuditPackage(pkg: any, adapter: AuditVerifyAdapter): Promise<{ valid: boolean; reason?: string }>;

  /**
   * Validate envelope-format audit package: decrypt and verify integrity + optional chain checks.
   */
  validateEnvelope(envelope: AuditPackageEnvelope, auditKey: string): Promise<ValidateAuditPackageResult>;

  /**
   * Four-phase verification for auditors: pre-check, on-chain access control,
   * chain anchoring, and trustless verification.
   * @param options.chainRecordFields - When provided and chain has no field_commitments cache, use these 9 field values + package nonce to recompute commit_field and compare to package commitments (proves disclosed data matches chain).
   */
  verifyEnvelopePhases(
    envelope: AuditPackageEnvelope,
    auditKey: string,
    registry?: IInvoiceRegistryService,
    options?: {
      chainRecordFields?: {
        amount: bigint;
        taxAmount: bigint;
        dueDate: number;
        buyer: string;
        seller: string;
        currency: string;
        itemsHash: string;
        memoHash: string;
        orderId: string;
      };
    }
  ): Promise<VerifyEnvelopePhasesResult>;

  /** Wave 3 角色隔离打包：buyer 打包 PaymentRecord，seller 打包 PAID InvoiceRecord（含 TaxGroups） */
  generateV3(params: GenerateAuditPackageParamsV3): Promise<GenerateAuditPackageResultV3>;

  /** Wave 3 三阶段验证：Identity → Money Flow → Tax Check。Step 2 使用 registry.getPaymentCommitment(settlement_anchor) 双向校验。 */
  verifyV3(
    envelope: AuditPackageEnvelopeV3,
    auditKey: string,
    services: { protocol: IAleoProtocolService; crypto: ICryptoService; registry: IInvoiceRegistryService }
  ): Promise<VerifyAuditPackageV3Result>;
}

/** Result of each verification phase for UI display. */
export interface VerifyPhaseResult {
  ok: boolean;
  message: string;
  checks?: { key: string; ok: boolean; detail?: string }[];
}

export interface VerifyEnvelopePhasesResult {
  overallValid: boolean;
  phase1: VerifyPhaseResult;
  phase2: VerifyPhaseResult;
  phase3: VerifyPhaseResult;
  phase4: VerifyPhaseResult;
  phase5: VerifyPhaseResult;
  decrypted?: any;
}

/** Wave 3 角色感知的审计包生成参数 */
export interface GenerateAuditPackageParamsV3 {
  role: 'buyer' | 'seller';
  records: Array<{
    invoiceId: AleoField;
    invoice?: Invoice;
    receipt?: PaymentReceipt;
  }>;
  expiresAt: number;
  permissions: string[];
  tNumber?: string;
}

/** Wave 3 审计包生成结果 */
export interface GenerateAuditPackageResultV3 {
  envelope: AuditPackageEnvelopeV3;
  auditKey: string;
  auditKeyHash: AleoField;
  summary: {
    recordCount: number;
    totalAmount: bigint;
    totalTaxAmount: bigint;
  };
}

/** Wave 3 三阶段验证结果 */
export interface VerifyAuditPackageV3Result {
  overallValid: boolean;
  step1Identity: {
    ok: boolean;
    tNumber?: string;
    chainJctReg?: AleoField;
    hashMatch?: boolean;
    ntaApiResult?: { name: string; status: string } | null;
    message: string;
  };
  step2MoneyFlow: {
    ok: boolean;
    txIdHash?: AleoField;
    transfers?: Array<{ from: AleoAddress; to: AleoAddress; amount: bigint }>;
    amountMatch?: boolean;
    message: string;
  };
  step3TaxCheck: {
    ok: boolean;
    taxGroups?: TaxGroups;
    chainTaxTag?: AleoField;
    verificationA?: { ok: boolean; detail?: string };
    verificationB?: { ok: boolean; detail?: string };
    verificationC?: { ok: boolean; detail?: string };
    message: string;
  };
}
