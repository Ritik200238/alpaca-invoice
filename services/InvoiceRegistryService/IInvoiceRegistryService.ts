import type { AleoAddress, AleoField } from '@/lib/types';
import type { InvoiceStatus } from '@/lib/types';

/**
 * Business service for querying zk_invoice contract state (Wave 2.2 + Wave 3 mappings).
 */
export interface IInvoiceRegistryService {
  // --- Basic Information Queries ---
  getInvoiceHash(invoiceId: AleoField): Promise<AleoField | null>;
  getInvoiceStatus(invoiceId: AleoField): Promise<InvoiceStatus | null>;

  // --- Wave 3 Invoice Mappings (audit: Identity / Money Flow / Tax Check) ---
  /** 查 invoice_tax_tag mapping (key: invoice_id → value: tax_tag)，供审计 Step 3 Tax Check */
  getInvoiceTaxTag(invoiceId: AleoField): Promise<AleoField | null>;

  /** 查 invoice_jct_reg mapping (key: invoice_id → value: jct_registration)，供审计 Step 1 Identity */
  getInvoiceJctReg(invoiceId: AleoField): Promise<AleoField | null>;

  /**
   * Query payment_commitments mapping (key: settlement_anchor → value: invoice_id) for audit Step 2 money-flow check.
   * Key is PaymentRecord.settlement_anchor (commitment hash), not invoice_id.
   */
  getPaymentCommitment(settlementAnchor: AleoField): Promise<AleoField | null>;

  // --- Wave 2.2 Audit Core Anchors ---
  /** Get the commitment root of an invoice for auditors to compare against locally recalculated root */
  getCommitmentRoot(invoiceId: AleoField): Promise<AleoField | null>;

  /** Get the pre-stored FieldCommitments on-chain (for auditing package commitments comparison) */
  getFieldCommitments(invoiceId: AleoField): Promise<Record<string, AleoField> | null>;

  /** Get the pre-validation rules result on-chain (R1-R5) */
  getRulesResult(invoiceId: AleoField): Promise<AleoField | null>;

  /** Get the audit authorization information registered on-chain for this invoice (scopes, expires_at) */
  getAuditAuthorization(invoiceId: AleoField): Promise<{
    audit_key_hash: AleoField;
    scopes_bitmask: bigint;
    expires_at: number;
    issuer: AleoAddress;
  } | null>;

  // --- Counters and Statistics ---
  getInvoiceCount(seller: AleoAddress): Promise<number>;
  getAuditCounter(seller: AleoAddress): Promise<number>;
}
