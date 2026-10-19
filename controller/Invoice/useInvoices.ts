import { useMemo, useState, useEffect, useCallback } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { AleoField, Invoice, InvoiceStatus, CurrencyFlag } from '@/lib/types';
import { IInvoices, InvoiceWithRole } from './IInvoices';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { updateInvoiceFromInvoiceRecord, buildInvoiceFromRecord, cleanAleoField } from '@/lib/invoice';
import { InvoiceStatusValidator } from '@/services/InvoiceStatusValidator/InvoiceStatusValidatorImpl';
import { useInvoiceListRole } from './useInvoiceListRole';
import { useInvoiceListFilter } from './useInvoiceListFilter';
import { useInvoiceListInitialize } from './useInvoiceListInitialize';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { fetchAndMergeKvDetails } from './useInvoiceKvSync';
import { useInvoicePollingCore } from './useInvoicePollingCore';
import { toast } from 'sonner';

/**
 * StatusConfig type (re-exported for UI)
 */
export type { StatusConfig } from './IInvoices';

/**
 * useInvoices Hook
 * Composes sub-hooks to provide invoice list functionality.
 *
 * Responsibilities:
 * - Initialize invoice data (from IndexedDB or chain)
 * - Provide filter/search/grouping
 * - Handle pay/cancel actions
 * - Batch sync
 *
 * Polling model:
 * - Auto polling is managed by the global InvoiceAutoPoller (single source of truth)
 * - After user actions call markInvoiceSending to trigger AutoPoller
 * - Details view uses useInvoiceChainSync for manual sync
 */
export function useInvoices(): IInvoices {
  const wallet = useWallet();
  const { publicKey, masterKey } = useUserStore();
  const { 
    invoices, 
    setInvoices,
    updateInvoice,
    sendingInvoiceHashes,
    markInvoiceSending  // Marks invoice as SENDING (triggers AutoPoller)
  } = useInvoiceStore();
  const { scanAllInvoiceRecords, scanInvoiceRecord } = useInvoiceChainScan();
  const { reconcilePendingWithMapping } = useInvoicePollingCore();
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. Initialization (polling managed globally)
  const { isLoading, initialize } = useInvoiceListInitialize();

  // 2. Derive roles (chainStatus computed in hook using sendingInvoiceHashes)
  const { invoicesWithRole } = useInvoiceListRole(invoices, sendingInvoiceHashes);
  // 3. Filter and search
  const { filteredInvoices, filter, search, setFilter, setSearch } = useInvoiceListFilter(invoicesWithRole);

  // 4. Group invoices by role and status
  const { receivedInvoices, sentInvoices, pending, complete } = useMemo(() => {
    const received: InvoiceWithRole[] = [];
    const sent: InvoiceWithRole[] = [];
    const pendingList: InvoiceWithRole[] = [];
    const completeList: InvoiceWithRole[] = [];

    filteredInvoices.forEach((item) => {
      const { invoice, role } = item;

      // Group by role
      if (role === 'BUYER' || role === 'BOTH') {
        received.push(item);
      }
      if (role === 'SELLER' || role === 'BOTH') {
        sent.push(item);
      }

      // Group by status
      if (invoice.status === InvoiceStatus.PENDING) {
        pendingList.push(item);
      }
      if (invoice.status === InvoiceStatus.PAID) {
        completeList.push(item);
      }
    });

    return {
      receivedInvoices: received,
      sentInvoices: sent,
      pending: pendingList,
      complete: completeList,
    };
  }, [filteredInvoices]);

  // 5. Actions for each invoice (list view)
  const { executePay, executeCancel } = useTransactionController();
  const { handleError } = useErrorHandler();
  
  // Track per-invoice processing state
  const [processingInvoiceIds, setProcessingInvoiceIds] = useState<Set<string>>(new Set());
  
  const handlePay = useCallback(async (invoice: Invoice) => {
    // Set processing flag
    setProcessingInvoiceIds(prev => new Set(prev).add(invoice.id));
    
    try {
      toast.loading('Processing payment...', { id: `pay-${invoice.id}` });
      const transactionId = await executePay(invoice);
      
      // Clear processing flag
      setProcessingInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
      
      toast.success('Payment submitted!', {
        id: `pay-${invoice.id}`,
        description: `Transaction ID: ${transactionId.slice(0, 16)}... View details for status.`
      });
      
      // Mark as SENDING (AutoPoller will take over polling)
      markInvoiceSending(invoice.invoiceHash);
    } catch (error) {
      toast.error('Payment failed', {
        id: `pay-${invoice.id}`,
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      handleError(error as Error);
      // Clear processing flag on error
      setProcessingInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
    }
  }, [executePay, handleError, markInvoiceSending]);

  const handleCancel = useCallback(async (invoice: Invoice) => {
    // Set processing flag
    setProcessingInvoiceIds(prev => new Set(prev).add(invoice.id));
    
    try {
      toast.loading('Cancelling invoice...', { id: `cancel-${invoice.id}` });
      const transactionId = await executeCancel(invoice);
      // executeCancel already updates invoice metadata to SENDING
      
      // Clear processing flag
      setProcessingInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
      
      toast.success('Cancel request submitted!', { 
        id: `cancel-${invoice.id}`,
        description: `Transaction ID: ${transactionId.slice(0, 16)}... View details for status.`
      });
      
      // Mark as SENDING (AutoPoller will take over polling)
      markInvoiceSending(invoice.invoiceHash);
    } catch (error) {
      toast.error('Failed to cancel invoice', {
        id: `cancel-${invoice.id}`,
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      handleError(error as Error);
      // Clear processing flag on error
      setProcessingInvoiceIds(prev => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
    }
  }, [executeCancel, handleError, markInvoiceSending]);

  // Helper: check whether a given invoice is processing
  const isInvoiceProcessing = useCallback((invoiceId: string) => {
    return processingInvoiceIds.has(invoiceId);
  }, [processingInvoiceIds]);

  // Helper: check whether an invoice is syncing (single source of truth)
  const isInvoiceSyncing = useCallback((invoice: Invoice) => {
    return sendingInvoiceHashes[invoice.invoiceHash] === true;
  }, [sendingInvoiceHashes]);

  // 6. Batch sync (reset all invoices with setInvoices)
  const handleSyncAll = useCallback(async () => {
    if (!publicKey || !masterKey) {
      toast.error('Unable to sync', {
        description: 'Missing required data'
      });
      return;
    }

    // Guard: wallet must be connected before scanning chain records.
    // Without this check, requestRecords throws WalletNotConnectedError
    // and the fallback loop repeats that error for every local invoice.
    if (!wallet?.connected) {
      toast.error('Wallet not connected', {
        description: 'Please connect your wallet before syncing.'
      });
      return;
    }

    setIsSyncing(true);
    try {
      toast.loading('Syncing all invoices...', { id: 'sync-all' });
      
      // Scan with invoice_id de-duplication
      const { byInvoiceId: invoiceRecordsByInvoiceId } = await scanAllInvoiceRecords();
      const statusValidator = new InvoiceStatusValidator();
      
      // Rebuild full invoice list from on-chain data
      const syncedInvoices: Invoice[] = [];
      
      const isSynced = (inv: Invoice) =>
        syncedInvoices.some(
          (s) =>
            cleanAleoField(s.id) === cleanAleoField(inv.id) ||
            s.invoiceHash === inv.invoiceHash
        );

      // 1) Process InvoiceRecord only (invoice list page should not depend on PaymentRecord scan)
      for (const [invoiceId, invoiceRecordData] of invoiceRecordsByInvoiceId.entries()) {
        try {
          const localInvoice = invoices.find((inv: Invoice) => {
            const cleanLocalId = cleanAleoField(inv.id);
            const cleanRecordId = cleanAleoField(invoiceId);
            return cleanLocalId === cleanRecordId ||
              inv.invoiceHash === invoiceRecordData.invoiceHash;
          });
          
          if (localInvoice) {
            const validation = statusValidator.validateRecord(
              invoiceRecordData.record,
              localInvoice.metadata?.action,
              localInvoice.status
            );
            
            if (validation.shouldConfirm) {
              const updatedInvoice = updateInvoiceFromInvoiceRecord(localInvoice, invoiceRecordData.record);
              syncedInvoices.push({
                ...localInvoice,
                ...updatedInvoice,
                details: localInvoice.details,
                metadata: {
                  confirmationStatus: 'CONFIRMED',
                  dataSource: 'chain',
                  action: localInvoice.metadata?.action
                }
              } as Invoice);
            }
          } else {
            // New invoice: build from chain record
            const invoice = buildInvoiceFromRecord(
              invoiceRecordData.record,
              invoiceRecordData.invoiceHash as AleoField
            );
            
            if (invoiceRecordData.record.originalInvoiceId) {
              invoice.id = invoiceRecordData.record.originalInvoiceId as AleoField;
            }
            
            syncedInvoices.push({
              ...invoice,
              metadata: {
                confirmationStatus: 'CONFIRMED',
                dataSource: 'chain'
              }
            } as Invoice);
          }
        } catch (error) {
          console.error(`Failed to process invoice ${invoiceId}:`, error);
          continue;
        }
      }

      // 2) Fallback: per-invoice scan to avoid missing confirmations
      // when bulk parsing/dedup does not return a local invoice.
      // Skip entirely if wallet is no longer connected to avoid N repeated WalletNotConnectedErrors.
      if (wallet?.connected) {
        for (const localInvoice of invoices) {
          if (isSynced(localInvoice)) continue;

          // Re-check wallet connection before each per-invoice call
          if (!wallet?.connected) {
            console.warn('[SyncAll] Wallet disconnected mid-fallback, aborting per-invoice scan');
            break;
          }

          try {
            const { invoiceRecord } = await scanInvoiceRecord(
              localInvoice.invoiceHash,
              localInvoice.id
            );
            if (!invoiceRecord) continue;

            const validation = statusValidator.validateRecord(
              invoiceRecord,
              localInvoice.metadata?.action,
              localInvoice.status
            );
            if (!validation.shouldConfirm) continue;

            const updatedInvoice = updateInvoiceFromInvoiceRecord(localInvoice, invoiceRecord);

            syncedInvoices.push({
              ...localInvoice,
              ...updatedInvoice,
              details: localInvoice.details,
              metadata: {
                confirmationStatus: 'CONFIRMED',
                dataSource: 'chain',
                action: localInvoice.metadata?.action
              }
            } as Invoice);
          } catch (error) {
            console.warn(`Fallback scan failed for ${localInvoice.invoiceHash}:`, error);
          }
        }
      } else {
        console.warn('[SyncAll] Wallet disconnected – skipping per-invoice fallback scan');
      }
      
      // Preserve SENDING invoices (not yet on chain) so they don't get deleted
      for (const inv of invoices) {
        if (!isSynced(inv) && inv.metadata?.confirmationStatus === 'SENDING') {
          syncedInvoices.push(inv);
        }
      }

      // Reconcile: for invoices still showing PENDING after Record scan,
      // cross-check against the public invoice_status mapping.
      // This catches counterparty-driven changes (e.g. seller cancelled)
      // that the current wallet's private Records cannot reflect.
      const reconciledInvoices = await reconcilePendingWithMapping(syncedInvoices);
      if (reconciledInvoices.length > 0) {
        for (let i = 0; i < syncedInvoices.length; i++) {
          const match = reconciledInvoices.find(r => r.id === syncedInvoices[i].id);
          if (match) {
            syncedInvoices[i] = { ...syncedInvoices[i], ...match };
          }
        }
        console.log(`🔄 [SyncAll] Reconciled ${reconciledInvoices.length} PENDING invoice(s) via public mapping`);
      }

      // Final dedup by invoiceHash to guarantee no duplicates
      const seen = new Set<string>();
      const deduped: Invoice[] = [];
      for (const inv of syncedInvoices) {
        const key = inv.invoiceHash || cleanAleoField(inv.id);
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(inv);
      }
      if (deduped.length < syncedInvoices.length) {
        console.log(`🔄 [SyncAll] Removed ${syncedInvoices.length - deduped.length} duplicate(s)`);
      }

      // Reset store with synced invoices (rebuilds sending index automatically)
      if (deduped.length > 0) {
        await setInvoices(deduped, {
          masterKey,
          persistFull: true,
          metadata: {
            confirmationStatus: 'CONFIRMED',
            lastUpdated: new Date(),
            dataSource: 'chain'
          }
        });

        // §3.9: fetch encrypted details from KV for invoices missing details (buyer side)
        await fetchAndMergeKvDetails(deduped, updateInvoice, masterKey);
      }
      
      toast.success('Batch sync successful', {
        id: 'sync-all',
        description: `Synced ${deduped.length} invoice(s) from chain`
      });
    } catch (error) {
      console.error('Failed to sync all invoices:', error);
      toast.error('Sync failed', {
        id: 'sync-all',
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsSyncing(false);
    }
  }, [publicKey, masterKey, invoices, setInvoices, updateInvoice, scanAllInvoiceRecords, scanInvoiceRecord]);

  // Auto-initialize when wallet is connected (masterKey optional)
  useEffect(() => {
    if (publicKey && wallet?.connected) {
      console.log('📋 [useInvoices] Initializing with publicKey:', publicKey);
      console.log('📋 [useInvoices] Has masterKey:', !!masterKey);
      initialize();
    }
  }, [publicKey, wallet?.connected, initialize]);

  // Status flags (align with detail view)
  const showLoading = useMemo(() => isLoading, [isLoading]);
  const showWalletPrompt = useMemo(() => {
    return !isLoading && !publicKey;
  }, [isLoading, publicKey]);
  const showMainContent = useMemo(() => {
    return !isLoading && invoices.length >= 0;
  }, [isLoading, invoices.length]);

  // Wave 3 派生聚合数据（Dashboard）
  const totalAccountPayable = useMemo(() => {
    return receivedInvoices
      .filter((item) => item.invoice.status === InvoiceStatus.PENDING)
      .reduce((sum, item) => sum + (item.invoice.totalAmount ?? item.invoice.amount), 0n);
  }, [receivedInvoices]);

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  const totalPaidThisMonth = useMemo(() => {
    return complete
      .filter((item) => {
        const d = item.invoice.metadata?.lastUpdated ?? item.invoice.createdAt;
        return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
      })
      .reduce((sum, item) => sum + (item.invoice.totalAmount ?? item.invoice.amount), 0n);
  }, [complete, thisYear, thisMonth]);

  const jctDeductibleAmount = useMemo(() => {
    return complete
      .filter((item) => {
        const tag = item.invoice.taxTag;
        return tag != null && tag !== '0field';
      })
      .reduce((sum, item) => sum + (item.invoice.taxAmount ?? 0n), 0n);
  }, [complete]);

  const currencyDistribution = useMemo(() => {
    let credits = 0n;
    let usdcx = 0n;
    complete.forEach((item) => {
      const amt = item.invoice.totalAmount ?? item.invoice.amount;
      if (item.invoice.currencyFlag === CurrencyFlag.USDCX) usdcx += amt;
      else credits += amt;
    });
    return { credits, usdcx };
  }, [complete]);

  const taxTrend = useMemo(() => {
    const months: Array<{ month: string; inputTax: bigint; outputTax: bigint }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(thisYear, thisMonth - i, 1);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      let inputTax = 0n;
      let outputTax = 0n;
      const y = d.getFullYear();
      const m = d.getMonth();
      receivedInvoices
        .filter((item) => item.invoice.status === InvoiceStatus.PAID)
        .forEach((item) => {
          const date = item.invoice.metadata?.lastUpdated ?? item.invoice.createdAt;
          if (date.getFullYear() === y && date.getMonth() === m) {
            inputTax += item.invoice.taxAmount ?? 0n;
          }
        });
      sentInvoices
        .filter((item) => item.invoice.status === InvoiceStatus.PAID)
        .forEach((item) => {
          const date = item.invoice.metadata?.lastUpdated ?? item.invoice.createdAt;
          if (date.getFullYear() === y && date.getMonth() === m) {
            outputTax += item.invoice.taxAmount ?? 0n;
          }
        });
      months.push({ month: monthStr, inputTax, outputTax });
    }
    return months;
  }, [receivedInvoices, sentInvoices, thisYear, thisMonth]);

  return {
    // Data
    filteredInvoices,
    receivedInvoices,
    sentInvoices,
    pending,
    complete,
    // State
    filter,
    search,
    isLoading,
    isSyncing,
    showLoading,
    showWalletPrompt,
    showMainContent,
    // Methods
    setFilter,
    setSearch,
    refresh: initialize,
    handleSyncAll,
    handlePay,
    handleCancel,
    isInvoiceProcessing,
    isInvoiceSyncing,
    totalAccountPayable,
    totalPaidThisMonth,
    jctDeductibleAmount,
    currencyDistribution,
    taxTrend
  };
}
