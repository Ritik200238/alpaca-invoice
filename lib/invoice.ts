import { Invoice, InvoiceStatus, AleoField, CurrencyFlag, type TaxGroups } from './types';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { cleanAleoNumber } from './utils';

// ============================================================================
// Invoice status configuration
// ============================================================================

/**
 * Invoice status configuration
 */
export interface StatusConfig {
  label: string;
  icon: string;
  bg: string;
  text: string;
  border: string;
}

/**
 * Get UI configuration for an invoice status
 *
 * @param status - Invoice status
 * @returns Status configuration object containing label, icon, style classes, etc.
 */
export function getStatusConfig(status: InvoiceStatus): StatusConfig {
  switch (status) {
    case InvoiceStatus.PENDING:
      return {
        label: 'Pending',
        icon: '⏳',
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        border: 'border-amber-300'
      };
    case InvoiceStatus.PAID:
      return {
        label: 'Paid',
        icon: '✅',
        bg: 'bg-green-100',
        text: 'text-green-700',
        border: 'border-green-300'
      };
    case InvoiceStatus.CANCELLED:
      return {
        label: 'Cancelled',
        icon: '❌',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300'
      };
    case InvoiceStatus.EXPIRED:
      return {
        label: 'Expired',
        icon: '⚠️',
        bg: 'bg-red-100',
        text: 'text-red-700',
        border: 'border-red-300'
      };
    case InvoiceStatus.DISPUTED:
      return {
        label: 'Disputed',
        icon: '⚠️',
        bg: 'bg-orange-100',
        text: 'text-orange-700',
        border: 'border-orange-300'
      };
    case InvoiceStatus.ESCROWED:
      return {
        label: 'Escrowed',
        icon: '🔒',
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        border: 'border-blue-300'
      };
    case InvoiceStatus.REFUNDED:
      return {
        label: 'Refunded',
        icon: '↩️',
        bg: 'bg-purple-100',
        text: 'text-purple-700',
        border: 'border-purple-300'
      };
    case InvoiceStatus.RESOLVED_PAID:
      return {
        label: 'Resolved (Paid)',
        icon: '✅',
        bg: 'bg-green-100',
        text: 'text-green-700',
        border: 'border-green-300'
      };
    case InvoiceStatus.RESOLVED_CANCELLED:
      return {
        label: 'Resolved (Cancelled)',
        icon: '❌',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300'
      };
    default:
      return {
        label: 'Unknown',
        icon: '❓',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300'
      };
  }
}

// ============================================================================
// Tax groups (JCT)
// ============================================================================

/**
 * 从 invoice.taxGroups 解析适用税率文案（group_a=10%, group_b=8%，仅 net_sum>0 的组）
 */
export function getTaxRateLabelFromTaxGroups(taxGroups: TaxGroups | undefined): string | null {
  if (!taxGroups) return null;
  const parts: string[] = [];
  if (Number(taxGroups.group_a?.net_sum ?? 0) > 0) parts.push('10%');
  if (Number(taxGroups.group_b?.net_sum ?? 0) > 0) parts.push('8%');
  return parts.length > 0 ? parts.join(', ') : null;
}

// ============================================================================
// Invoice role determination
// ============================================================================

/**
 * Core role determination logic (pure function, reusable)
 *
 * @param publicKey - Current user's public key
 * @param invoice - Invoice object
 * @returns User role: 'seller' | 'buyer' | 'unknown' | 'both'
 */
export function determineInvoiceRole(
  publicKey: string,
  invoice: Invoice
): 'seller' | 'buyer' | 'unknown' | 'both' {
  if (!publicKey || !invoice) return 'unknown';

  // Clean address strings, remove possible visibility modifiers
  const cleanPublicKey = publicKey.replace(/\.(private|public)$/, '');
  const cleanSeller = invoice.seller.replace(/\.(private|public)$/, '');
  const cleanBuyer = invoice.buyer.replace(/\.(private|public)$/, '');

  const isSeller = cleanPublicKey === cleanSeller;
  const isBuyer = cleanPublicKey === cleanBuyer;

  if (isSeller && isBuyer) return 'both';
  if (isSeller) return 'seller';
  if (isBuyer) return 'buyer';
  return 'unknown';
}

// ============================================================================
// Invoice utility functions
// ============================================================================

/**
 * Build an Invoice object from an on-chain InvoiceRecord
 *
 * @param record - On-chain InvoiceRecord
 * @param invoiceHash - Invoice hash
 * @returns Constructed Invoice object
 */
export function buildInvoiceFromRecord(
  record: AleoInvoiceRecord,
  invoiceHash: AleoField
): Invoice {
  // If invoice_id does not exist, use invoiceHash as fallback
  const cleanInvoiceId = (record.invoice_id?.replace(/field\.(private|public)$/, 'field') || invoiceHash) as AleoField;
  const cleanAmount = cleanAleoNumber(record.amount);
  const cleanDueDate = cleanAleoNumber(record.due_date);
  const cleanCreatedAt = cleanAleoNumber(record.created_at);
  const cleanStatus = cleanAleoNumber(record.status);

  const inv: Invoice = {
    id: cleanInvoiceId,
    invoiceHash: invoiceHash,
    seller: record.seller as any,
    buyer: record.buyer as any,
    amount: BigInt(cleanAmount) as any,
    taxAmount: record.tax_amount ? BigInt(cleanAleoNumber(record.tax_amount)) as any : undefined,
    dueDate: new Date(Number(cleanDueDate) * 1000),
    createdAt: Number(cleanCreatedAt) > 0
      ? new Date(Number(cleanCreatedAt) * 1000)
      : new Date(),
    status: Number(cleanStatus) as any,
    orderId: record.order_id ? cleanAleoField(record.order_id) as AleoField : undefined,
    currency: record.currency ? cleanAleoField(record.currency) as AleoField : undefined,
    itemsHash: record.items_hash ? cleanAleoField(record.items_hash) as AleoField : undefined,
    memoHash: record.memo_hash ? cleanAleoField(record.memo_hash) as AleoField : undefined,
    transactionId: record.transactionId,
    blockHeight: record.blockHeight != null ? Number(record.blockHeight) : undefined,
    details: undefined // On-chain data does not include details
  };
  // Wave 3: map tax_tag, jct_registration, total_amount, currency_flag
  if (record.tax_tag != null && record.tax_tag !== '0field') {
    inv.taxTag = cleanAleoField(record.tax_tag) as AleoField;
  }
  if (record.jct_registration != null && record.jct_registration !== '0field') {
    inv.jctRegistration = cleanAleoField(record.jct_registration) as AleoField;
  }
  if (record.total_amount != null) {
    inv.totalAmount = BigInt(cleanAleoNumber(record.total_amount)) as any;
  }
  if (record.currency_flag != null) {
    inv.currencyFlag = Number(cleanAleoNumber(record.currency_flag)) as CurrencyFlag;
  }
  return inv;
}

/**
 * Update an Invoice object from a PaymentRecord
 *
 * @param invoice - Original invoice object
 * @param paymentRecord - On-chain PaymentRecord
 * @returns Updated partial invoice data
 */
export function updateInvoiceFromPaymentRecord(
  invoice: Invoice,
  paymentRecord: AleoPaymentRecord
): Partial<Invoice> {
  const cleanInvoiceId = paymentRecord.invoice_id?.replace(/field\.(private|public)$/, 'field') as AleoField;
  const cleanAmount = cleanAleoNumber(paymentRecord.amount);

  return {
    id: cleanInvoiceId,
    invoiceHash: invoice.invoiceHash,
    seller: paymentRecord.payee as any,
    buyer: paymentRecord.payer as any,
    amount: BigInt(cleanAmount) as any,
    totalAmount: invoice.totalAmount ?? BigInt(cleanAmount) as any,
    dueDate: invoice.dueDate,
    createdAt: invoice.createdAt,
    status: 1 as any,
    nonce: invoice.nonce,
    auditKey: invoice.auditKey,
    taxTag: invoice.taxTag,
    jctRegistration: invoice.jctRegistration,
    currencyFlag: invoice.currencyFlag,
    transactionId: invoice.transactionId,
    blockHeight: invoice.blockHeight
  };
}

/**
 * Update an Invoice object from an InvoiceRecord
 *
 * @param invoice - Original invoice object
 * @param invoiceRecord - On-chain InvoiceRecord
 * @returns Updated partial invoice data
 */
export function updateInvoiceFromInvoiceRecord(
  invoice: Invoice,
  invoiceRecord: AleoInvoiceRecord
): Partial<Invoice> {
  // If invoice_id does not exist, use original invoice.id as fallback
  const cleanInvoiceId = (invoiceRecord.invoice_id?.replace(/field\.(private|public)$/, 'field') || invoice.id) as AleoField;
  const cleanAmount = cleanAleoNumber(invoiceRecord.amount);
  const cleanDueDate = cleanAleoNumber(invoiceRecord.due_date);
  const cleanCreatedAt = cleanAleoNumber(invoiceRecord.created_at);
  const cleanStatus = cleanAleoNumber(invoiceRecord.status);

  const partial: Partial<Invoice> = {
    id: cleanInvoiceId,
    invoiceHash: invoice.invoiceHash,
    seller: invoiceRecord.seller as any,
    buyer: invoiceRecord.buyer as any,
    amount: BigInt(cleanAmount) as any,
    taxAmount: invoiceRecord.tax_amount ? BigInt(cleanAleoNumber(invoiceRecord.tax_amount)) as any : invoice.taxAmount,
    dueDate: new Date(Number(cleanDueDate) * 1000),
    createdAt: Number(cleanCreatedAt) > 0
      ? new Date(Number(cleanCreatedAt) * 1000)
      : invoice.createdAt,
    status: Number(cleanStatus) as any,
    orderId: invoiceRecord.order_id ? cleanAleoField(invoiceRecord.order_id) as AleoField : invoice.orderId,
    currency: invoiceRecord.currency ? cleanAleoField(invoiceRecord.currency) as AleoField : invoice.currency,
    itemsHash: invoiceRecord.items_hash ? cleanAleoField(invoiceRecord.items_hash) as AleoField : invoice.itemsHash,
    memoHash: invoiceRecord.memo_hash ? cleanAleoField(invoiceRecord.memo_hash) as AleoField : invoice.memoHash,
    transactionId: invoiceRecord.transactionId ?? invoice.transactionId,
    blockHeight: invoiceRecord.blockHeight != null ? Number(invoiceRecord.blockHeight) : invoice.blockHeight,
    nonce: invoice.nonce,
    auditKey: invoice.auditKey,
    details: invoice.details,
  };
  if (invoiceRecord.tax_tag != null && invoiceRecord.tax_tag !== '0field') {
    partial.taxTag = cleanAleoField(invoiceRecord.tax_tag) as AleoField;
  }
  if (invoiceRecord.jct_registration != null && invoiceRecord.jct_registration !== '0field') {
    partial.jctRegistration = cleanAleoField(invoiceRecord.jct_registration) as AleoField;
  }
  if (invoiceRecord.total_amount != null) {
    partial.totalAmount = BigInt(cleanAleoNumber(invoiceRecord.total_amount)) as any;
  }
  if (invoiceRecord.currency_flag != null) {
    partial.currencyFlag = Number(cleanAleoNumber(invoiceRecord.currency_flag)) as CurrencyFlag;
  }
  return partial;
}

/**
 * Clean Aleo field visibility modifiers
 *
 * @param field - Aleo field string
 * @returns Cleaned field string
 */
export function cleanAleoField(field: string): string {
  return field.replace(/field\.(private|public)$/, 'field');
}

/**
 * Deduplicate InvoiceRecord Map by invoice_id
 * If there are multiple records with the same invoice_id, prefer the one with spent set to false
 *
 * @param recordsByHash - InvoiceRecord Map indexed by invoice_hash (already contains originalInvoiceId)
 * @param rawRecords - Array of raw record objects (used to extract spent status)
 * @returns Deduplicated Map indexed by invoice_id, containing record and invoiceHash
 */
export function deduplicateInvoiceRecordsByInvoiceId(
  recordsByHash: Map<string, AleoInvoiceRecord & { originalInvoiceId?: string }>,
  rawRecords: Array<{
    data: any;
    spent: boolean;
    invoiceHash: string;
  }>
): Map<string, {
  record: AleoInvoiceRecord & { originalInvoiceId?: string };
  invoiceHash: string;
}> {
  const recordsMap = new Map<string, {
    record: AleoInvoiceRecord & { originalInvoiceId?: string };
    invoiceHash: string;
    spent: boolean;
    statusNum: number;
  }>();

  // Build an index of rawRecords (by invoiceHash, to get spent status)
  const rawRecordsByHash = new Map<string, boolean>();
  for (const rawRecord of rawRecords) {
    rawRecordsByHash.set(rawRecord.invoiceHash, rawRecord.spent);
  }

  // Iterate through all InvoiceRecords, deduplicate by invoice_id
  for (const [invoiceHash, record] of recordsByHash.entries()) {
    const cleanInvoiceId = cleanAleoField(record.invoice_id || '');
    if (!cleanInvoiceId) {
      continue; // Skip records without invoice_id
    }

    const isSpent = rawRecordsByHash.get(invoiceHash) || false;
    const statusNum = Number(cleanAleoNumber(record.status));

    const candidate = {
      record: record, // record already contains originalInvoiceId
      invoiceHash: invoiceHash,
      spent: isSpent,
      statusNum: statusNum
    };

    const existing = recordsMap.get(cleanInvoiceId);

    // Selection strategy:
    // 1. Prefer unspent records (spent === false)
    // 2. If spent status is the same, prefer the one with a higher status (cancelled=2 > pending=0)
    const shouldReplace = !existing ||
      (existing.spent && !isSpent) || // Existing is spent, candidate is unspent
      (existing.spent === isSpent && statusNum > existing.statusNum); // Same spent status, select higher status

    if (shouldReplace) {
      recordsMap.set(cleanInvoiceId, candidate);
      console.log(`[deduplicateInvoiceRecordsByInvoiceId] Selected record for invoice_id ${cleanInvoiceId}: spent=${isSpent}, status=${statusNum}, hash=${invoiceHash}`);
    }
  }

  // Convert to final format
  const result = new Map<string, {
    record: AleoInvoiceRecord & { originalInvoiceId?: string };
    invoiceHash: string;
  }>();
  for (const [invoiceId, data] of recordsMap.entries()) {
    result.set(invoiceId, {
      record: data.record,
      invoiceHash: data.invoiceHash
    });
  }

  console.log(`[deduplicateInvoiceRecordsByInvoiceId] Deduplicated ${recordsByHash.size} records to ${result.size} unique invoice_ids`);
  return result;
}
