import { useMemo } from 'react';
import { useInvoiceData } from './useInvoiceData';
import { useInvoiceRole } from './useInvoiceRole';
import { useInvoiceChainSync } from './useInvoiceChainSync';
import { useInvoiceActions } from './useInvoiceActions';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { getStatusConfig } from '@/lib/invoice';
import { IInvoiceDetail } from './IInvoiceDetail';
import { AleoField, InvoiceStatus, CurrencyFlag } from '@/lib/types';
import type { InvoiceState } from '@/stores/Invoice/InvoiceState';
import { ZERO_FIELD } from '@/lib/contract';

/**
 * useInvoiceDetail Hook
 * Implements detail viewing and record reconciliation.
 *
 * Polling architecture:
 * - Auto polling: managed globally by InvoiceAutoPoller (listens to sendingInvoiceHashes)
 * - Manual sync: provided by useInvoiceChainSync (handleSyncStatus)
 * - Status display: isSyncing is derived from sendingInvoiceHashes
 *
 * This hook composes sub-hooks:
 * - useInvoiceData: load invoice data
 * - useInvoiceRole: determine user role
 * - useInvoiceChainSync: manual sync logic
 * - useInvoiceActions: pay / cancel actions
 * - useInvoiceStore: subscribe to global SENDING state
 */
export function useInvoiceDetail(invoiceHash: AleoField | null): IInvoiceDetail {
  // 1. Data loading
  const { 
    invoice, 
    isLoading: isLoadingInvoice, 
    confirmationStatus
  } = useInvoiceData(invoiceHash);
  
  // 2. User role
  const userRole = useInvoiceRole(invoice);
  
  // 3. Status configuration
  const statusConfig = useMemo(() => {
    return invoice ? getStatusConfig(invoice.status) : getStatusConfig(InvoiceStatus.PENDING);
  }, [invoice]);
  
  // 4. Subscribe to global SENDING state to derive isSyncing
  const sendingInvoiceHashes = useInvoiceStore(
    (state: InvoiceState) => state.sendingInvoiceHashes
  );
  const isSyncing = useMemo(() => {
    const syncing = invoiceHash ? sendingInvoiceHashes[invoiceHash] === true : false;
    // [DEBUG] Log when we expect spinner (SENDING) but isSyncing is false — key mismatch or timing
    if (typeof window !== 'undefined' && invoiceHash && invoice) {
      const expectSpinner = invoice.metadata?.confirmationStatus === 'SENDING';
      if (expectSpinner && !syncing) {
        const keys = Object.keys(sendingInvoiceHashes);
        const hasKey = keys.includes(invoiceHash);
        const rawValue = (sendingInvoiceHashes as Record<string, unknown>)[invoiceHash];
        console.log('[DEBUG useInvoiceDetail] Spinner expected but isSyncing=false', {
          invoiceHashFromUrl: invoiceHash,
          invoiceHashLength: invoiceHash?.length,
          invoiceInvoiceHash: invoice.invoiceHash,
          sameAsUrl: invoiceHash === invoice.invoiceHash,
          sendingKeysCount: keys.length,
          sendingKeysSample: keys.slice(0, 2),
          hasExactKey: hasKey,
          rawValue,
          invoiceId: invoice?.id
        });
      }
    }
    return syncing;
  }, [invoiceHash, sendingInvoiceHashes, invoice]);
  
  // 5. Manual sync helpers (auto polling handled globally)
  const {
    isSyncingStatus,
    handleSyncStatus
  } = useInvoiceChainSync(
    invoice, 
    invoiceHash, 
    confirmationStatus
  );
  
  // 6. Actions (pay/cancel mark SENDING; AutoPoller handles polling)
  const {
    isProcessing,
    handlePay,
    handleCancel
  } = useInvoiceActions(invoice);

  const isJctInvoice = Boolean(
    invoice?.taxTag != null && invoice.taxTag !== ZERO_FIELD
  );
  const isUsdcxInvoice = invoice?.currencyFlag === CurrencyFlag.USDCX;
  const taxTag = invoice?.taxTag ?? null;
  const jctRegistration = invoice?.jctRegistration ?? null;
  const totalAmount = invoice?.totalAmount ?? invoice?.amount ?? null;
  const taxGroups = invoice?.taxGroups ?? null;

  return {
    invoice,
    isLoadingInvoice,
    currentStatus: confirmationStatus,
    isSyncing,
    isConfirmed: confirmationStatus === 'CONFIRMED',
    userRole,
    statusConfig,
    isProcessing,
    isSyncingStatus,
    handlePay,
    handleCancel,
    handleSyncStatus,
    isJctInvoice,
    isUsdcxInvoice,
    taxTag,
    jctRegistration,
    totalAmount,
    taxGroups
  };
}
