import { useCallback, useMemo } from 'react';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { AleoField, Invoice, InvoiceStatus } from '@/lib/types';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { useInvoiceChainScan } from './useInvoiceChainScan';
import { updateInvoiceFromInvoiceRecord } from '@/lib/invoice';
import { PollingService } from '@/services/PollingService/PollingServiceImpl';
import { createInvoiceValidationAdapter, InvoiceScanResult } from '@/services/PollingService/adapters/InvoiceStatusValidatorAdapter';
import { InvoiceStatusValidator } from '@/services/InvoiceStatusValidator/InvoiceStatusValidatorImpl';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { createInvoiceRegistryService } from '@/services/InvoiceRegistryService/createInvoiceRegistryService';
import { PROGRAM_ID, PROGRAM_ID_V4 } from '@/lib/contract';
import { cleanAleoNumber } from '@/lib/utils';

const POLL_INTERVAL = 15000; // 15 seconds
const POLL_TIMEOUT = 180000; // 3 minutes timeout
const MAPPING_CACHE_MS = 20000;

/**
 * Polling callbacks
 */
export interface PollingCallbacks {
  /** Invoked when polling succeeds */
  onSuccess: (updatedInvoice: Invoice, record: AleoInvoiceRecord | AleoPaymentRecord) => void | Promise<void>;
  /** Invoked on polling timeout */
  onTimeout: (rolledBackInvoice: Invoice) => void | Promise<void>;
  /** Optional error callback */
  onError?: (error: Error) => void;
}

/**
 * Hook: core polling logic
 *
 * Responsibilities:
 * - Encapsulate single-invoice polling flow
 * - Handle scan, validate, confirm pipeline
 * - Provide callbacks for flexible handling
 * - Reused by useInvoiceListPolling and useInvoiceChainSync
 */
export function useInvoicePollingCore() {
  const { scanInvoiceRecord } = useInvoiceChainScan();
  const statusValidator = useMemo(() => new InvoiceStatusValidator(), []);
  const protocolService = useMemo(() => new AleoProtocolService(), []);

  /**
   * Get the latest invoice from the store
   */
  const getLatestInvoice = useCallback((invoiceHash: AleoField): Invoice | null => {
    const store = useInvoiceStore.getState();
    return store.invoices.find((inv: Invoice) => inv.invoiceHash === invoiceHash) || 
           (store.currentInvoice?.invoiceHash === invoiceHash ? store.currentInvoice : null);
  }, []);

  /**
   * Build updated Invoice from the paid InvoiceRecord only.
   * Do not use PaymentRecord — amount/status must come from InvoiceRecord (user pays pre-tax amount).
   */
  const buildUpdatedInvoice = useCallback((invoice: Invoice, invoiceRecord: AleoInvoiceRecord): Invoice => {
    const updatedFields = updateInvoiceFromInvoiceRecord(invoice, invoiceRecord);
    return {
      ...invoice,
      ...updatedFields,
      metadata: {
        confirmationStatus: 'CONFIRMED',
        dataSource: 'chain',
        lastUpdated: new Date(),
        action: invoice.metadata?.action
      }
    };
  }, []);

  /**
   * Build rolled-back Invoice (used on timeout)
   */
  const buildRolledBackInvoice = useCallback((invoice: Invoice): Invoice => {
    return {
      ...invoice,
      metadata: {
        confirmationStatus: 'TIMEOUT',
        dataSource: 'local',
        lastUpdated: new Date(),
        action: invoice.metadata?.action
      }
    };
  }, []);

  /**
   * Create a PollingService for a single invoice
   *
   * @param invoiceHash - invoice hash
   * @param invoice - initial invoice object
   * @param callbacks - callbacks
   * @returns PollingService instance
   */
  const createPollingService = useCallback((
    invoiceHash: AleoField,
    invoice: Invoice,
    callbacks: PollingCallbacks
  ): PollingService<InvoiceScanResult> => {
    console.log(`🔄 [PollingCore] Creating polling service for: ${invoiceHash}`, {
      action: invoice.metadata?.action,
      status: invoice.status,
      confirmationStatus: invoice.metadata?.confirmationStatus
    });

    // Create PollingService
    return new PollingService<InvoiceScanResult>(
      {
        pollInterval: POLL_INTERVAL,
        pollTimeout: POLL_TIMEOUT,
        taskName: `Invoice polling (${invoiceHash.slice(0, 20)}...)`
      },
      {
        // Scan: always fetch latest invoice from store
        scan: async () => {
          const latestInvoice = getLatestInvoice(invoiceHash);
          const invoiceId = latestInvoice?.id || invoice.id;
          
          const result = await scanInvoiceRecord(invoiceHash, invoiceId);
          return {
            invoiceRecord: result.invoiceRecord,
            paymentRecord: result.paymentRecord
          };
        },
        
        // Validate: always use latest invoice from store
        validate: (result) => {
          const latestInvoice = getLatestInvoice(invoiceHash);
          
          if (!latestInvoice) {
            console.warn(`⚠️ [PollingCore] Invoice not found during validation: ${invoiceHash}`);
            return {
              shouldStop: false,
              reason: 'Invoice not found',
              shouldContinue: false
            };
          }
          
      // Build validation adapter with latest invoice
      const validateAdapter = createInvoiceValidationAdapter(statusValidator, latestInvoice);
      return validateAdapter(result);
    },
        
        // Success callback: only update invoice from paid InvoiceRecord (never PaymentRecord — amount must stay pre-tax)
        onSuccess: async (result) => {
          if (result.invoiceRecord) {
            const latestInvoice = getLatestInvoice(invoiceHash) || invoice;
            const updatedInvoice = buildUpdatedInvoice(latestInvoice, result.invoiceRecord);
            console.log(`✅ [PollingCore] Polling succeeded for: ${invoiceHash}`);
            await callbacks.onSuccess(updatedInvoice, result.invoiceRecord);
          }
          // If only paymentRecord exists, do not update invoice (wait for InvoiceRecord or user re-sync)
        },
        
        // Timeout callback
        onTimeout: async () => {
          // Use latest invoice from store when building rollback
          const latestInvoice = getLatestInvoice(invoiceHash) || invoice;
          const rolledBackInvoice = buildRolledBackInvoice(latestInvoice);
          
          console.log(`⚠️ [PollingCore] Polling timeout for: ${invoiceHash}`);
          await callbacks.onTimeout(rolledBackInvoice);
        },
        
        // Error callback
        onError: callbacks.onError || ((error) => {
          console.error(`❌ [PollingCore] Polling error for ${invoiceHash}:`, error);
        })
      }
    );
  }, [scanInvoiceRecord, statusValidator, getLatestInvoice, buildUpdatedInvoice, buildRolledBackInvoice]);

  /**
   * Mapping-first quick probe: returns on-chain status/hash, avoiding decrypt when possible
   */
  const registry = useMemo(() => createInvoiceRegistryService(protocolService), [protocolService]);
  const fetchChainAnchors = useCallback(async (invoiceId: AleoField) => {
    try {
      const [hash, status] = await Promise.all([
        registry.getInvoiceHash(invoiceId),
        registry.getInvoiceStatus(invoiceId)
      ]);
      return { hash, status };
    } catch (e) {
      console.warn('Mapping fetch failed', e);
      return { hash: null, status: null };
    }
  }, [registry]);

  /**
   * Query invoice_status from both V3 and V4 programs, V4 takes precedence.
   * Escrow/Dispute operations write to V4, while basic invoice ops use V3.
   */
  const getChainInvoiceStatus = useCallback(async (invoiceId: AleoField): Promise<InvoiceStatus | null> => {
    const [v3Status, v4Raw] = await Promise.all([
      registry.getInvoiceStatus(invoiceId).catch(() => null),
      protocolService.getProgramMappingValue(
        PROGRAM_ID_V4, 'invoice_status', invoiceId
      ).catch(() => null),
    ]);

    let v4Status: InvoiceStatus | null = null;
    if (v4Raw) {
      const cleaned = cleanAleoNumber(v4Raw.replace(/"/g, '').trim());
      v4Status = Number(cleaned) as InvoiceStatus;
    }

    return v4Status ?? v3Status;
  }, [registry, protocolService]);

  /**
   * Cross-reference PENDING invoices against the public `invoice_status` mapping.
   *
   * Queries both V3 and V4 programs. V4 takes precedence since escrow/dispute
   * status updates are written there.
   *
   * @returns invoices whose on-chain mapping status differs from local PENDING
   */
  const reconcilePendingWithMapping = useCallback(async (
    invoices: Invoice[]
  ): Promise<Invoice[]> => {
    const pending = invoices.filter(inv => inv.status === InvoiceStatus.PENDING);
    if (pending.length === 0) return [];

    const reconciled: Invoice[] = [];

    const results = await Promise.allSettled(
      pending.map(inv =>
        getChainInvoiceStatus(inv.id).then(status => ({ inv, status }))
      )
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { inv, status } = result.value;
      if (status !== null && status !== InvoiceStatus.PENDING) {
        console.log(
          `[PollingCore] Mapping reconciliation: ${inv.id} local=PENDING -> chain=${InvoiceStatus[status]}`
        );
        reconciled.push({
          ...inv,
          status,
          metadata: {
            confirmationStatus: 'CONFIRMED',
            dataSource: 'chain',
            lastUpdated: new Date(),
            action: inv.metadata?.action
          }
        });
      }
    }

    if (reconciled.length > 0) {
      console.log(`[PollingCore] Reconciled ${reconciled.length} invoice(s) via public mapping`);
    }

    return reconciled;
  }, [getChainInvoiceStatus]);

  return {
    createPollingService,
    getLatestInvoice,
    buildUpdatedInvoice,
    buildRolledBackInvoice,
    fetchChainAnchors,
    getChainInvoiceStatus,
    reconcilePendingWithMapping
  };
}
