import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { toast } from 'sonner';
import { useUserStore } from '@/stores/User/useUserStore';
import { useReceiptStore, type ReceiptItem } from '@/stores/Receipt/useReceiptStore';
import { useInvoiceChainScan } from '@/controller/Invoice/useInvoiceChainScan';
import { cleanAleoNumber } from '@/lib/utils';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import type { EncryptedPayload, InvoiceDetails, LineItem } from '@/lib/types';

function isEncryptedPayload(raw: unknown): raw is EncryptedPayload {
  const r = raw as Record<string, unknown>;
  return typeof r?.iv === 'string' && typeof r?.ciphertext === 'string';
}

function normalizeField(field?: string): string {
  return String(field ?? '').replace(/field\.(private|public)$/i, 'field').trim();
}

type ReceiptDetails = InvoiceDetails & { lineItems: (LineItem & { taxRate?: number })[] };
export type ReceiptViewItem = ReceiptItem & { details?: ReceiptDetails };
type EnrichedReceipt = ReceiptItem & { details?: ReceiptDetails };

function toReceiptItem(record: any): ReceiptItem | null {
  const paymentId = normalizeField(record?.payment_id);
  const invoiceId = normalizeField(record?.invoice_id);
  const payer = String(record?.payer ?? '').trim();
  const payee = String(record?.payee ?? '').trim();
  if (!paymentId || !invoiceId || !payer || !payee) return null;

  const paidAtUnix = Number(cleanAleoNumber(record?.paid_at ?? 0));
  const paidAt = Number.isFinite(paidAtUnix) && paidAtUnix > 0
    ? new Date(paidAtUnix * 1000)
    : new Date();

  return {
    paymentId: paymentId as any,
    invoiceId: invoiceId as any,
    payer: payer as any,
    payee: payee as any,
    amount: BigInt(cleanAleoNumber(record?.amount ?? 0)) as any,
    paidAt,
    settlementAnchor: record?.settlement_anchor
      ? (normalizeField(record.settlement_anchor) as any)
      : undefined,
    txId: record?.transactionId ? String(record.transactionId).trim() as any : undefined,
    blockHeight: Number.isFinite(Number(record?.blockHeight)) ? Number(record.blockHeight) : undefined
  };
}

export function useReceipts() {
  const wallet = useWallet();
  const { publicKey } = useUserStore();
  const { scanAllPaymentRecords } = useInvoiceChainScan();
  const { receipts, setReceipts, getAllReceipts, exportCsv, updateReceiptByPaymentId } = useReceiptStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [detailsByPaymentId, setDetailsByPaymentId] = useState<Record<string, ReceiptDetails>>({});
  /** Prevent infinite loop: auto-sync only once when receipts are empty (do not re-run when sync returns 0) */
  const hasAutoSyncAttemptedRef = useRef(false);
  /** Track which paymentIds we've attempted to decrypt (avoid re-running when decrypt fails). Cleared on mount so we re-hydrate after navigation. */
  const attemptedDecryptRef = useRef<Set<string>>(new Set());
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      attemptedDecryptRef.current.clear();
    }
  }, []);

  const initialize = useCallback(async () => {
    setIsLoading(true);
    try {
      const loaded = await getAllReceipts();
      if (loaded.length > 0) {
        const cryptoService = new CryptoService();
        const decryptedEntries = await Promise.all(
          loaded.map(async (r) => {
            if (!r.encryptedDetails) return null;
            try {
              const decrypted = await cryptoService.decryptPayloadWithInvoiceId(
                r.encryptedDetails,
                String(r.invoiceId)
              );
              return [normalizeField(r.paymentId), decrypted] as const;
            } catch {
              return null;
            }
          })
        );
        const nextMap: Record<string, ReceiptDetails> = {};
        for (const entry of decryptedEntries) {
          if (!entry) continue;
          nextMap[entry[0]] = entry[1];
        }
        setDetailsByPaymentId(nextMap);
      }
    } finally {
      setIsLoading(false);
    }
  }, [getAllReceipts]);

  const handleSyncAllReceipts = useCallback(async () => {
    if (!publicKey || !wallet?.connected) {
      toast.error('Connect wallet first');
      return;
    }

    setIsSyncing(true);
    toast.loading('Syncing payment records...', { id: 'sync-receipts' });
    try {
      const paymentMap = await scanAllPaymentRecords();
      const items: ReceiptItem[] = [];
      for (const payment of paymentMap.values()) {
        const item = toReceiptItem(payment);
        if (item) items.push(item);
      }
      await setReceipts(items);

      // Enrich receipts with invoice details from KV ; persist encryptedDetails to IndexedDB
      if (items.length > 0) {
        try {
          const cryptoService = new CryptoService();
          const enriched = await Promise.all(
            items.map(async (item) => {
              try {
                const res = await fetch(
                  `/api/invoice-details?invoiceId=${encodeURIComponent(String(item.invoiceId))}`
                );
                if (!res.ok) return item as EnrichedReceipt;
                const { details } = await res.json();
                if (!details) return item as EnrichedReceipt;
                const raw = details as Record<string, unknown>;
                if (isEncryptedPayload(raw)) {
                  const decrypted = await cryptoService.decryptPayloadWithInvoiceId(
                    raw,
                    String(item.invoiceId)
                  );
                  return { ...item, details: decrypted as ReceiptDetails, encryptedDetails: raw } as EnrichedReceipt;
                }
                return { ...item, details: raw as unknown as ReceiptDetails } as EnrichedReceipt;
              } catch {
                return item as EnrichedReceipt;
              }
            })
          );
          const nextMap: Record<string, ReceiptDetails> = {};
          for (const r of enriched) {
            if (r.details) {
              nextMap[normalizeField(r.paymentId)] = r.details;
            }
            if (r.encryptedDetails) {
              try {
                await updateReceiptByPaymentId(r.paymentId, { encryptedDetails: r.encryptedDetails });
              } catch (e) {
                console.warn('[useReceipts] Failed to persist encryptedDetails for receipt:', r.invoiceId, e);
              }
            }
          }
          if (Object.keys(nextMap).length > 0) {
            setDetailsByPaymentId((prev) => ({ ...prev, ...nextMap }));
          }
        } catch {
          // Non-fatal — receipts are synced even without details
        }
      }

      toast.success('Receipts synced', {
        id: 'sync-receipts',
        description: `Synced ${items.length} payment receipt(s) from chain`
      });
    } catch (error) {
      console.error('❌ [useReceipts] Sync failed:', error);
      toast.error('Sync failed', {
        id: 'sync-receipts',
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsSyncing(false);
    }
  }, [publicKey, wallet?.connected, scanAllPaymentRecords, setReceipts, updateReceiptByPaymentId]);

  useEffect(() => {
    if (publicKey && wallet?.connected) {
      void initialize();
    }
  }, [publicKey, wallet?.connected, initialize]);

  // Re-hydrate details from IndexedDB whenever receipts (from store) change.
  // Fixes: after switching away and back, detailsByPaymentId is reset but encryptedDetails are in IDB.
  useEffect(() => {
    if (receipts.length === 0) return;
    const attempted = attemptedDecryptRef.current;
    const missing = receipts.filter((r) => {
      const key = normalizeField(r.paymentId);
      return r.encryptedDetails && !detailsByPaymentId[key] && !attempted.has(key);
    });
    if (missing.length === 0) return;
    missing.forEach((r) => attempted.add(normalizeField(r.paymentId)));
    let cancelled = false;
    const cryptoService = new CryptoService();
    Promise.all(
      missing.map(async (r) => {
        if (!r.encryptedDetails) return null;
        try {
          const decrypted = await cryptoService.decryptPayloadWithInvoiceId(
            r.encryptedDetails,
            String(r.invoiceId)
          );
          return [normalizeField(r.paymentId), decrypted] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, ReceiptDetails> = {};
      for (const e of entries) {
        if (!e) continue;
        next[e[0]] = e[1];
      }
      if (Object.keys(next).length > 0) {
        setDetailsByPaymentId((prev) => ({ ...prev, ...next }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [receipts, detailsByPaymentId]);

  useEffect(() => {
    if (!publicKey || !wallet?.connected || isSyncing || hasAutoSyncAttemptedRef.current) return;
    if (receipts.length > 0) return;
    hasAutoSyncAttemptedRef.current = true;
    void handleSyncAllReceipts();
  }, [publicKey, wallet?.connected, receipts.length, isSyncing, handleSyncAllReceipts]);

  const sortedReceipts = useMemo(() => {
    const merged: ReceiptViewItem[] = receipts.map((r) => ({
      ...r,
      details: detailsByPaymentId[normalizeField(r.paymentId)]
    }));
    return merged.sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
  }, [receipts, detailsByPaymentId]);

  return {
    receipts: sortedReceipts,
    isLoading,
    isSyncing,
    showWalletPrompt: !isLoading && !publicKey,
    handleSyncAllReceipts,
    exportCsv
  };
}
