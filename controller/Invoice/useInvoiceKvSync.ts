import type { Invoice, AleoField, EncryptedPayload } from '@/lib/types';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';

/**
 * Fetch encrypted invoice details from the online KV store and merge into the Store/IndexedDB.
 *
 * §3.9 supplement: after chain sync, invoices built from on-chain records have no `details`.
 * This function fills the gap by fetching from the KV store, decrypting with the shared
 * invoiceId-derived key, and calling `updateInvoice` so the data is persisted locally.
 *
 * @param invoices  Invoices that may be missing `details`
 * @param updateInvoice  Store's updateInvoice function
 * @param masterKey  Optional — when provided, updateInvoice will persist to IndexedDB
 */
export async function fetchAndMergeKvDetails(
  invoices: Invoice[],
  updateInvoice: (id: AleoField, updates: Partial<Invoice>, options?: {
    masterKey?: string;
    persistFull?: boolean;
  }) => Promise<void>,
  masterKey?: string
): Promise<void> {
  const toFetch = invoices.filter(inv => !inv.details && inv.invoiceHash && inv.id);
  if (toFetch.length === 0) return;

  const cryptoService = new CryptoService();

  const results = await Promise.allSettled(
    toFetch.map(async (inv) => {
      let raw: any = null;
      const res = await fetch(
        `/api/invoice-details?invoiceHash=${encodeURIComponent(inv.invoiceHash)}`
      );
      if (res.ok) {
        const data = await res.json();
        raw = data?.details ?? null;
      }
      if (!raw && inv.id !== inv.invoiceHash) {
        try {
          const res2 = await fetch(
            `/api/invoice-details?invoiceId=${encodeURIComponent(inv.id)}`
          );
          if (res2.ok) {
            const data2 = await res2.json();
            raw = data2?.details ?? null;
          }
        } catch { /* fallback failed, continue */ }
      }
      if (!raw) return;

      let plainDetails: unknown = raw;
      if (typeof raw?.iv === 'string' && typeof raw?.ciphertext === 'string') {
        plainDetails = await cryptoService.decryptPayloadWithInvoiceId(
          raw as unknown as EncryptedPayload,
          inv.id
        );
      }

      await updateInvoice(
        inv.id,
        { details: plainDetails } as any,
        { masterKey, persistFull: !!masterKey }
      );
    })
  );

  const fulfilled = results.filter(r => r.status === 'fulfilled').length;
  const rejected = results.filter(r => r.status === 'rejected').length;
  if (fulfilled > 0 || rejected > 0) {
    console.log(`[KvSync] Fetched details for ${fulfilled}/${toFetch.length} invoice(s)` +
      (rejected > 0 ? `, ${rejected} failed` : ''));
  }
}
