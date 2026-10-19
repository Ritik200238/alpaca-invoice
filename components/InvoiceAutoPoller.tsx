'use client';

import { useEffect, useRef } from 'react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useInvoiceListPolling } from '@/controller/Invoice/useInvoiceListPolling';
import { AleoField, Invoice } from '@/lib/types';
import type { InvoiceState } from '@/stores/Invoice/InvoiceState';
import { useUserStore } from '@/stores/User/useUserStore';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';

/**
 * InvoiceAutoPoller - Global automatic polling component
 *
 * Responsibilities:
 * - Listens to sendingInvoiceHashes in the store
 * - Automatically starts polling when new SENDING invoices are detected
 * - Automatically updates the store after polling completes (removes SENDING status)
 *
 * Features:
 * - Global singleton: placed in app/(app)/layout.tsx to ensure only one instance runs
 * - Auto-responsive: automatically starts polling regardless of which page triggers markInvoiceSending
 * - Cross-page sync: all pages share the same polling state
 */
export function InvoiceAutoPoller() {
  const masterKey = useUserStore((state) => state.masterKey);
  const sendingInvoiceHashes = useInvoiceStore(
    (state: InvoiceState) => state.sendingInvoiceHashes
  );
  const markInvoiceConfirmed = useInvoiceStore(
    (state: InvoiceState) => state.markInvoiceConfirmed
  );
  const updateInvoice = useInvoiceStore((state: InvoiceState) => state.updateInvoice);
  
  // Use ref to track invoices that have already started polling (to avoid duplicate starts)
  const pollingHashesRef = useRef<Set<AleoField>>(new Set());

  // Polling complete callback: update invoice status and remove from sending index
  const handlePollingComplete = async (invoiceHash: AleoField, updatedInvoice: Invoice) => {
    const isChainConfirmed = updatedInvoice.metadata?.confirmationStatus === 'CONFIRMED';
    console.log(
      `${isChainConfirmed ? '✅' : '⚠️'} [AutoPoller] Polling ${isChainConfirmed ? 'complete' : 'timeout'} for: ${invoiceHash}`
    );

    // Safety net: chain-built invoice has no details — recover from store before persisting.
    console.log('🔍 [DEBUG-ARBITER] handlePollingComplete entry:', {
      hash: invoiceHash?.slice(0, 30),
      updatedInvoiceId: updatedInvoice.id?.slice(0, 30),
      hasDetails: !!updatedInvoice.details,
      arbiter: (updatedInvoice.details as any)?.arbiter ?? 'NO DETAILS',
      action: updatedInvoice.metadata?.action,
      confirmationStatus: updatedInvoice.metadata?.confirmationStatus,
    });
    if (!updatedInvoice.details) {
      const storeState = useInvoiceStore.getState();
      const storeInvoice = storeState.invoices.find(
        (inv: Invoice) => inv.invoiceHash === invoiceHash
      ) ?? (storeState.currentInvoice?.invoiceHash === invoiceHash
        ? storeState.currentInvoice
        : null);
      console.log('🔍 [DEBUG-ARBITER] Recovery attempt:', {
        storeInvoiceCount: storeState.invoices.length,
        foundInStore: !!storeInvoice,
        storeInvoiceHasDetails: !!storeInvoice?.details,
        storeArbiter: (storeInvoice?.details as any)?.arbiter ?? 'NONE',
      });
      if (storeInvoice?.details) {
        updatedInvoice = { ...updatedInvoice, details: storeInvoice.details };
        console.log('🔍 [DEBUG-ARBITER] ✅ Recovered details from store. arbiter:', (updatedInvoice.details as any)?.arbiter);
      } else {
        console.warn('🔍 [DEBUG-ARBITER] ❌ Could not recover details from store!');
      }
    }
    
    // Persist to IndexedDB only after true chain confirmation.
    // For timeout/unconfirmed cases, update memory only.
    const shouldPersist = Boolean(isChainConfirmed && masterKey);
    try {
      await updateInvoice(updatedInvoice.id, updatedInvoice, {
        masterKey: shouldPersist ? masterKey! : undefined,
        persistFull: shouldPersist
      });
    } catch (error: unknown) {
      console.error(`❌ [AutoPoller] Failed to update invoice ${invoiceHash}:`, error);
      // Keep tracking this hash for retry path.
      return;
    }
    
    // Always remove from sending index: on confirmation OR timeout.
    // For timeout (chain-rejected txs), the invoice reverts to its previous
    // status and the user gets a toast warning.
    markInvoiceConfirmed(invoiceHash);

    // §3.9: After chain confirmation for a create action, save encrypted invoice details to online KV.
    if (
      isChainConfirmed &&
      updatedInvoice.metadata?.action === 'create' &&
      updatedInvoice.invoiceHash &&
      updatedInvoice.id
    ) {
      if (!updatedInvoice.details) {
        console.warn('🔍 [DEBUG-ARBITER] ❌ KV upload SKIPPED — details is null after recovery!', {
          hash: updatedInvoice.invoiceHash?.slice(0, 30),
          id: updatedInvoice.id?.slice(0, 30),
        });
      } else {
        console.log('🔍 [DEBUG-ARBITER] KV upload starting...', {
          hash: updatedInvoice.invoiceHash?.slice(0, 30),
          id: updatedInvoice.id?.slice(0, 30),
          arbiter: (updatedInvoice.details as any)?.arbiter ?? 'NOT SET',
          detailKeys: Object.keys(updatedInvoice.details),
        });
        const cryptoService = new CryptoService();
        cryptoService
          .encryptPayloadWithInvoiceId(updatedInvoice.details, updatedInvoice.id)
          .then((encryptedPayload) => {
            console.log('🔍 [DEBUG-ARBITER] Encrypted payload ready, posting to /api/invoice-details...');
            return fetch('/api/invoice-details', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                invoiceHash: updatedInvoice.invoiceHash,
                invoiceId: updatedInvoice.id,
                details: encryptedPayload,
              }),
            });
          })
          .then(async (res) => {
            const body = await res.text();
            if (res.ok) {
              console.log('🔍 [DEBUG-ARBITER] ✅ KV POST succeeded:', body);
            } else {
              console.warn('🔍 [DEBUG-ARBITER] ❌ KV POST failed:', res.status, body);
            }
          })
          .catch((err) => console.warn('🔍 [DEBUG-ARBITER] ❌ Encrypt or POST error:', err));
      }
    }

    // Remove from tracking set
    pollingHashesRef.current.delete(invoiceHash);
  };

  // Use the polling hook
  const { startPolling } = useInvoiceListPolling(handlePollingComplete);

  // Listen for changes to sendingInvoiceHashes and automatically start polling
  useEffect(() => {
    const currentSendingHashes = Object.keys(sendingInvoiceHashes) as AleoField[];
    
    // Find newly added SENDING invoices (those that have not started polling yet)
    const newHashes = currentSendingHashes.filter(
      hash => !pollingHashesRef.current.has(hash)
    );
    
    if (newHashes.length > 0) {
      console.log(`🔄 [AutoPoller] Detected ${newHashes.length} new SENDING invoice(s), starting polling...`, {
        hashes: newHashes,
        hashLengths: newHashes.map((h) => h?.length)
      });
      // Mark as polling started
      newHashes.forEach(hash => pollingHashesRef.current.add(hash));
      // Start polling
      startPolling(newHashes);
    }
    
    // Cleanup: remove hashes that are no longer in the sending list
    const currentHashSet = new Set(currentSendingHashes);
    for (const hash of pollingHashesRef.current) {
      if (!currentHashSet.has(hash)) {
        pollingHashesRef.current.delete(hash);
      }
    }
  }, [sendingInvoiceHashes, startPolling]);

  // Batch KV backfill: on mount, scan all confirmed invoices with local details
  // and upload any that are missing from KV.
  const invoices = useInvoiceStore((state: InvoiceState) => state.invoices);
  const backfillRanRef = useRef(false);
  useEffect(() => {
    if (backfillRanRef.current || !masterKey) return;
    const candidates = invoices.filter(
      (inv) =>
        inv.details &&
        inv.invoiceHash &&
        inv.id &&
        inv.metadata?.confirmationStatus === 'CONFIRMED'
    );
    if (candidates.length === 0) return;
    backfillRanRef.current = true;

    const run = async () => {
      const cryptoService = new CryptoService();
      let uploaded = 0;
      for (const inv of candidates) {
        try {
          const checkRes = await fetch(
            `/api/invoice-details?invoiceHash=${encodeURIComponent(inv.invoiceHash!)}`
          );
          const checkData = checkRes.ok ? await checkRes.json() : null;
          if (checkData?.details) continue;

          const encrypted = await cryptoService.encryptPayloadWithInvoiceId(inv.details!, inv.id);
          const postRes = await fetch('/api/invoice-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              invoiceHash: inv.invoiceHash,
              invoiceId: inv.id,
              details: encrypted,
            }),
          });
          if (postRes.ok) uploaded++;
        } catch (err) {
          console.warn('[AutoPoller] Backfill error for', inv.invoiceHash?.slice(0, 20), err);
        }
      }
      if (uploaded > 0) {
        console.log(`[AutoPoller] ✅ KV batch backfill: uploaded ${uploaded}/${candidates.length} invoices`);
      }
    };
    run();
  }, [invoices, masterKey]);

  // This is a background component with no UI
  return null;
}
