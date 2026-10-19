import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';

function parseLeoPlaintextRecord(raw: string): Record<string, string> | null {
  const text = String(raw || '').trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return null;
  const body = text.slice(1, -1);
  const out: Record<string, string> = {};

  for (const row of body.split('\n')) {
    const line = row.trim().replace(/,$/, '');
    if (!line) continue;
    const sep = line.indexOf(':');
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim();
    const value = line
      .slice(sep + 1)
      .trim()
      .replace(/\.(private|public)\b/g, '');
    out[key] = value;
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Parse a single Record (shared logic)
 *
 * @param record - Raw record data (may be a string, object, etc.)
 * @param cryptoService - CryptoService instance
 * @returns Parsed record object, containing invoiceRecord or paymentRecord
 */
export async function parseSingleRecord(
  record: any,
  cryptoService: CryptoService
): Promise<{
  invoiceRecord?: AleoInvoiceRecord;
  paymentRecord?: AleoPaymentRecord;
} | null> {
  try {
    let recordData: any;

    // Handle different record formats
    if (typeof record === 'string') {
      recordData = JSON.parse(record);
    } else if (record && typeof record === 'object') {
      if (record.data) {
        if (typeof record.data === 'string') {
          try {
            recordData = JSON.parse(record.data);
          } catch {
            // Some wallets return plaintext-like strings; keep raw for parser fallback.
            recordData = record.data;
          }
        } else {
          recordData = record.data;
        }
      } else if (record.plaintext) {
        recordData = typeof record.plaintext === 'string'
          ? record.plaintext
          : record.plaintext;
      } else if (record.recordPlaintext) {
        recordData = record.recordPlaintext;
      } else if (record.record) {
        recordData = record.record;
      } else {
        recordData = record;
      }
    } else {
      return null;
    }

    if (!recordData) return null;

    // Convert to JSON string for parsing
    const recordJsonString = typeof recordData === 'string'
      ? recordData
      : JSON.stringify(recordData);

    let parsedRecord: any;
    const parsedLeoPlaintext = typeof recordData === 'string'
      ? parseLeoPlaintextRecord(recordData)
      : null;

    if (parsedLeoPlaintext) {
      parsedRecord = parsedLeoPlaintext;
    } else {
    try {
      parsedRecord = await cryptoService.parseAleoRecord<any>(recordJsonString);
    } catch {
      // Fallback to raw object (already plain in some adapters)
      parsedRecord = typeof recordData === 'object' ? recordData : null;
    }
    }

    if (!parsedRecord) return null;
    const candidate = parsedRecord.data ?? parsedRecord.record ?? parsedRecord;

    // Determine whether this is a PaymentRecord or an InvoiceRecord
    const isPaymentRecord =
      ('payment_id' in candidate && candidate.payment_id) ||
      ('paymentId' in candidate && candidate.paymentId);
    const isInvoiceRecord =
      ('invoice_hash' in candidate && candidate.invoice_hash) ||
      ('invoiceHash' in candidate && candidate.invoiceHash);

    if (isPaymentRecord) {
      return { paymentRecord: candidate as AleoPaymentRecord };
    } else if (isInvoiceRecord) {
      return { invoiceRecord: candidate as AleoInvoiceRecord };
    }

    return null;
  } catch (error) {
    console.warn('Failed to parse record:', error);
    return null;
  }
}

/**
 * Convert a record (object or string) to the string format required for wallet transaction inputs.
 * Shield/Leo expect Aleo record plaintext strings, not JSON-serialized objects.
 * Tries multiple common wallet response shapes so the prover receives valid Leo plaintext.
 */
export function toRecordInputString(record: any): string {
  if (typeof record === 'string') return record;
  const plain =
    record?.plaintext ??
    record?.recordPlaintext ??
    record?.record_plaintext ??
    (typeof record?.data === 'string' ? record.data : undefined) ??
    (typeof record?.value === 'string' ? record.value : undefined) ??
    (typeof record?.record === 'string' ? record.record : undefined) ??
    (typeof record?.decryptedRecord === 'string' ? record.decryptedRecord : undefined);
  if (typeof plain === 'string') return plain;
  const fallback = JSON.stringify(record);
  // Prover fails with "proving failed" if given JSON instead of Leo plaintext (e.g. "{\"owner\":...")
  if (fallback.includes('\\"') || /^\s*\{\s*"[^"]+":\s*"/.test(fallback)) {
    throw new Error(
      'Invoice record is not in Leo plaintext format. The wallet may not have returned record plaintext. ' +
        'Try reconnecting the wallet, refreshing the page, or use a wallet that returns record plaintext for transaction inputs.'
    );
  }
  return fallback;
}

