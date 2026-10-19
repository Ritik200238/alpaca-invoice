import { useEffect, useRef, useState } from 'react';
import { useInvoiceStore as useNewInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { ChainConfirmationStatus } from '@/stores/Invoice/InvoiceState';
import type { InvoiceState } from '@/stores/Invoice/InvoiceState';
import { AleoField, EncryptedPayload } from '@/lib/types';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';

/**
 * Hook: load invoice data
 *
 * Responsibilities:
 * - Load invoice data from store/IndexedDB
 * - Track confirmationStatus
 * - Manage loading state
 * - Subscribe to currentInvoice so updates are reactive
 */
export function useInvoiceData(invoiceHash: AleoField | null) {
  const { masterKey } = useUserStore();

  // Subscribe directly to currentInvoice from the store
  const currentInvoice = useNewInvoiceStore((state: InvoiceState) => state.currentInvoice);
  const setCurrentInvoice = useNewInvoiceStore((state: InvoiceState) => state.setCurrentInvoice);
  const updateInvoice    = useNewInvoiceStore((state: InvoiceState) => state.updateInvoice);

  const [isLoading, setIsLoading] = useState(true);
  // Track which hashes we have already attempted to fetch so we don't loop
  const fetchedHashesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!invoiceHash) {
      setCurrentInvoice(null);
      setIsLoading(false);
      return;
    }

    const loadInvoice = async () => {
      setIsLoading(true);
      try {
        // Use store helper; it auto-loads from memory or IndexedDB
        await setCurrentInvoice(invoiceHash, {
          masterKey: masterKey || undefined
        });
      } catch (error) {
        console.error('Failed to load invoice:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInvoice();
  }, [invoiceHash, masterKey, setCurrentInvoice]);

  // When the current invoice has no details (buyer side), fetch from KV and decrypt (§3.9).
  // The ref tracks hashes we already fetched. If the invoice had details but now doesn't
  // (e.g. after a chain sync overwrite), we clear the guard so it can re-fetch.
  const prevDetailsRef = useRef<boolean>(false);
  useEffect(() => {
    const hasDetails = !!currentInvoice?.details;
    if (prevDetailsRef.current && !hasDetails && currentInvoice?.invoiceHash) {
      fetchedHashesRef.current.delete(currentInvoice.invoiceHash);
    }
    prevDetailsRef.current = hasDetails;
  }, [currentInvoice?.details, currentInvoice?.invoiceHash]);

  useEffect(() => {
    if (!currentInvoice || currentInvoice.details) {
      if (currentInvoice?.details) {
        console.log('🔍 [DEBUG-ARBITER] useInvoiceData: invoice already has details. arbiter:', (currentInvoice.details as any)?.arbiter ?? 'NOT SET');
      }
      return;
    }
    const hash = currentInvoice.invoiceHash;
    const invoiceId = currentInvoice.id;
    if (!hash || !invoiceId || fetchedHashesRef.current.has(hash)) {
      console.log('🔍 [DEBUG-ARBITER] useInvoiceData: skipping KV fetch', {
        hasHash: !!hash,
        hasId: !!invoiceId,
        alreadyFetched: hash ? fetchedHashesRef.current.has(hash) : false,
      });
      return;
    }
    fetchedHashesRef.current.add(hash);

    console.log('🔍 [DEBUG-ARBITER] useInvoiceData: fetching details from KV...', {
      hash: hash?.slice(0, 30),
      invoiceId: invoiceId?.slice(0, 30),
      invoiceIdFull: invoiceId,
    });

    const tryFetchFromKV = async () => {
      let data: any = null;
      try {
        const url = `/api/invoice-details?invoiceHash=${encodeURIComponent(hash)}`;
        console.log('🔍 [DEBUG-ARBITER] KV fetch by hash:', url.slice(0, 80));
        const res = await fetch(url);
        console.log('🔍 [DEBUG-ARBITER] KV fetch by hash response:', res.status);
        data = res.ok ? await res.json() : null;
        console.log('🔍 [DEBUG-ARBITER] KV fetch by hash data:', { hasDetails: !!data?.details });
      } catch (err) {
        console.warn('🔍 [DEBUG-ARBITER] KV fetch by hash failed:', err);
      }

      if (!data?.details && invoiceId !== hash) {
        try {
          const url2 = `/api/invoice-details?invoiceId=${encodeURIComponent(invoiceId)}`;
          console.log('🔍 [DEBUG-ARBITER] KV fetch by id:', url2.slice(0, 80));
          const res2 = await fetch(url2);
          console.log('🔍 [DEBUG-ARBITER] KV fetch by id response:', res2.status);
          data = res2.ok ? await res2.json() : null;
          console.log('🔍 [DEBUG-ARBITER] KV fetch by id data:', { hasDetails: !!data?.details });
        } catch (err) {
          console.warn('🔍 [DEBUG-ARBITER] KV fetch by id failed:', err);
        }
      }

      if (!data?.details) {
        console.warn('🔍 [DEBUG-ARBITER] ❌ KV returned NO details for invoice:', {
          hash: hash?.slice(0, 30),
          invoiceId: invoiceId?.slice(0, 30),
          invoiceIdFull: invoiceId,
        });
        return;
      }

      console.log('🔍 [DEBUG-ARBITER] KV returned details, attempting decrypt...');
      const raw = data.details as Record<string, unknown>;
      let plainDetails: unknown = raw;
      if (
        typeof raw?.iv === 'string' &&
        typeof raw?.ciphertext === 'string'
      ) {
        try {
          console.log('🔍 [DEBUG-ARBITER] Decrypting with invoiceId:', invoiceId);
          plainDetails = await new CryptoService().decryptPayloadWithInvoiceId(
            raw as unknown as EncryptedPayload,
            invoiceId
          );
          console.log('🔍 [DEBUG-ARBITER] ✅ Decrypt success! arbiter:', (plainDetails as any)?.arbiter ?? 'NOT IN DECRYPTED DATA');
        } catch (e) {
          console.warn('🔍 [DEBUG-ARBITER] ❌ KV decrypt FAILED:', e);
          return;
        }
      } else {
        console.log('🔍 [DEBUG-ARBITER] Details not encrypted (raw JSON), arbiter:', (plainDetails as any)?.arbiter ?? 'NOT SET');
      }
      void updateInvoice(
        currentInvoice.id,
        { details: plainDetails } as any,
        { masterKey: masterKey || undefined, persistFull: !!masterKey }
      );
    };

    tryFetchFromKV();
  }, [currentInvoice?.invoiceHash, currentInvoice?.id, currentInvoice?.details, masterKey, updateInvoice]);

  // Auto-backfill KV: if we have details locally (decrypted from IndexedDB) but KV might not,
  // upload to KV so other parties (buyer) can access them.
  const backfilledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!currentInvoice?.details || !currentInvoice?.invoiceHash || !currentInvoice?.id) return;
    if (currentInvoice.metadata?.confirmationStatus !== 'CONFIRMED') return;
    const hash = currentInvoice.invoiceHash;
    if (backfilledRef.current.has(hash)) return;
    backfilledRef.current.add(hash);

    const backfill = async () => {
      try {
        const checkRes = await fetch(`/api/invoice-details?invoiceHash=${encodeURIComponent(hash)}`);
        const checkData = checkRes.ok ? await checkRes.json() : null;
        if (checkData?.details) return;

        console.log('[useInvoiceData] KV missing details, backfilling...', { hash: hash.slice(0, 30) });
        const crypto = new CryptoService();
        const encrypted = await crypto.encryptPayloadWithInvoiceId(currentInvoice.details!, currentInvoice.id);
        const postRes = await fetch('/api/invoice-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceHash: currentInvoice.invoiceHash,
            invoiceId: currentInvoice.id,
            details: encrypted,
          }),
        });
        if (postRes.ok) {
          console.log('[useInvoiceData] ✅ KV backfill successful');
        } else {
          console.warn('[useInvoiceData] KV backfill POST failed:', postRes.status);
        }
      } catch (err) {
        console.warn('[useInvoiceData] KV backfill error:', err);
      }
    };

    backfill();
  }, [currentInvoice?.details, currentInvoice?.invoiceHash, currentInvoice?.id, currentInvoice?.metadata?.confirmationStatus]);

  // Derive confirmationStatus reactively from currentInvoice.metadata
  const confirmationStatus: ChainConfirmationStatus | null = currentInvoice?.metadata?.confirmationStatus || null;

  return { 
    invoice: currentInvoice, 
    isLoading, 
    // Return the actual confirmationStatus; upstream can combine with sendingInvoiceHashes
    confirmationStatus: currentInvoice ? confirmationStatus : null
  };
}
