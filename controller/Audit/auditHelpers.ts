/**
 * Pure helpers for audit package generation.
 * Used by useAuditPackageGenerate.
 */

import { FIELD_SCOPE_IDS } from './auditConstants';

export const toSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

export const sumLineItems = (
  lineItems: { quantity: number; unitPrice: number }[]
): number =>
  lineItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);

export function buildScopesBitmask(fields: string[]): bigint {
  let mask = 0n;
  for (const f of fields) {
    const id = FIELD_SCOPE_IDS[f];
    if (id) {
      mask |= 1n << BigInt(id - 1);
    }
  }
  return mask;
}

/** Map selected field keys to AuditService permission strings. */
export function fieldsToPermissions(selectedFields: string[]): string[] {
  const perms = new Set<string>();
  if (selectedFields.includes('amount')) perms.add('READ_AMOUNT');
  if (selectedFields.includes('tax_amount')) perms.add('READ_TAX');
  if (selectedFields.includes('buyer') || selectedFields.includes('seller')) perms.add('READ_PARTIES');
  if (
    selectedFields.some((f) =>
      ['due_date', 'currency', 'items_hash', 'memo_hash', 'order_id'].includes(f)
    )
  ) {
    perms.add('READ_DETAILS');
  }
  return [...perms];
}
