/**
 * Audit feature constants and config.
 * Shared by useAuditPackageGenerate and audit UI components.
 */

export const FIELD_SCOPE_IDS: Record<string, number> = {
  amount: 1,
  tax_amount: 2,
  due_date: 3,
  buyer: 4,
  seller: 5,
  currency: 6,
  items_hash: 7,
  memo_hash: 8,
  order_id: 9
};

export const DEFAULT_FIELDS = ['amount', 'tax_amount', 'buyer', 'seller', 'due_date'];

export const AUDIT_FIELDS_LIST: { key: string; label: string }[] = [
  { key: 'amount', label: 'Amount' },
  { key: 'tax_amount', label: 'Tax amount' },
  { key: 'due_date', label: 'Due date' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'seller', label: 'Seller' },
  { key: 'currency', label: 'Currency' },
  { key: 'items_hash', label: 'Items hash' },
  { key: 'memo_hash', label: 'Memo hash' },
  { key: 'order_id', label: 'Order ID' }
];

/** Default expiration for audit package: 7 days from now, as YYYY-MM-DD for date inputs. */
export function getDefaultAuditExpiresAt(): string {
  const date = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  return date.toISOString().split('T')[0];
}
