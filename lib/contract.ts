// Centralized contract identifiers for runtime use (frontend only).
function resolveProgramId(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  if (!normalized || normalized === 'undefined' || normalized === 'null') {
    return fallback;
  }
  return normalized;
}

export const PROGRAM_ID = resolveProgramId(
  process.env.NEXT_PUBLIC_PROGRAM_ID,
  'zk_invoice_v3_3.aleo'
);
export const LEGACY_PROGRAM_ID = resolveProgramId(
  process.env.NEXT_PUBLIC_LEGACY_PROGRAM_ID,
  'zk_invoice_v3_0.aleo'
);
export const CREDITS_PROGRAM_ID = 'credits.aleo';

/** USDCx (Aleo Testnet); set via env when integrating. See https://aleo.org/usdcx */
export const USDCX_PROGRAM_ID = resolveProgramId(process.env.NEXT_PUBLIC_USDCX_PROGRAM_ID, '');

/** Wave 4.2 contract with ESCROWED-only Dispute + Arbiter Resolution */
export const PROGRAM_ID_V4 = resolveProgramId(
  process.env.NEXT_PUBLIC_PROGRAM_ID_V4,
  'zk_invoice_v4_2.aleo'
);

/** ZK Credit Proof standalone contract */
export const CREDIT_PROGRAM_ID = resolveProgramId(
  process.env.NEXT_PUBLIC_CREDIT_PROGRAM_ID,
  'zk_credit_v1_1.aleo'
);

/** Aleo field literal for zero (non-JCT / unused) */
export const ZERO_FIELD = '0field' as const;

/** Zero address placeholder for optional arbiter fields */
export const ZERO_ADDRESS = 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc' as const;

/** Wave 3 mapping names for zk_invoice_v3_1.aleo */
export const MAPPINGS = {
  // Core invoice mappings
  invoice_status: 'invoice_status',
  invoice_registry: 'invoice_registry',
  invoice_count: 'invoice_count',
  // JCT compliance mappings
  invoice_tax_tag: 'invoice_tax_tag',
  invoice_jct_reg: 'invoice_jct_reg',
  // Payment mappings
  payment_commitments: 'payment_commitments',
  // Audit mappings (required for Phase 3-5 verification)
  invoice_commitment: 'invoice_commitment',
  invoice_field_commitments: 'invoice_field_commitments',
  invoice_rules_result: 'invoice_rules_result',
  audit_authorization: 'audit_authorization',
  audit_counter: 'audit_counter'
} as const;

/** Wave 4 mapping names for zk_invoice_v4.aleo (superset of Wave 3) */
export const MAPPINGS_V4 = {
  ...MAPPINGS,
  dispute_registry: 'dispute_registry',
  dispute_status: 'dispute_status',
  dispute_resolution: 'dispute_resolution',
  escrow_registry: 'escrow_registry',
  escrow_balances: 'escrow_balances',
  escrow_status: 'escrow_status',
} as const;

/** ZK Credit mapping names */
export const CREDIT_MAPPINGS = {
  credit_proofs: 'credit_proofs',
} as const;
