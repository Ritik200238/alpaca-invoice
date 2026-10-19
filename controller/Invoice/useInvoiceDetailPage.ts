import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { createInvoiceRegistryService } from '@/services/InvoiceRegistryService/createInvoiceRegistryService';
import { EscrowService } from '@/services/EscrowService/EscrowServiceImpl';
import { useAuditPackageGenerate } from '@/controller/Audit/useAuditPackageGenerate';
import { useInvoiceDetail } from './useInvoiceDetail';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useEscrowStore } from '@/stores/Escrow/useEscrowStore';
import { useUserStore } from '@/stores/User/useUserStore';
import type { AleoAddress, AleoField, EscrowRecord, EscrowStatus, CurrencyFlag as CurrencyFlagType } from '@/lib/types';
import { CurrencyFlag, InvoiceStatus } from '@/lib/types';
import { PROGRAM_ID, PROGRAM_ID_V4 } from '@/lib/contract';
import { cleanAleoNumber } from '@/lib/utils';
import type { IInvoiceDetail } from './IInvoiceDetail';

export interface InvoiceDetailPageAnchors {
  commitment?: string | null;
  rules?: string | null;
  fieldCommitments?: any;
  auth?: any;
  counter?: number | null;
}

export interface UseInvoiceDetailPageReturn extends IInvoiceDetail {
  displayCurrency: string;
  chainArbiter: string | null;
  anchors: InvoiceDetailPageAnchors;
  isFetchingAnchors: boolean;
  downloadMsg: string;
  safeStringify: (obj: any) => string;
  handleDownloadPackage: (mode: 'minimal' | 'full') => Promise<void>;
}

export function useInvoiceDetailPage(invoiceHash: AleoField | null): UseInvoiceDetailPageReturn {
  const detail = useInvoiceDetail(invoiceHash);
  const { generate } = useAuditPackageGenerate();
  const protocolService = useMemo(() => new AleoProtocolService(), []);
  const registry = useMemo(() => createInvoiceRegistryService(protocolService), [protocolService]);
  const escrowService = useMemo(() => new EscrowService(), []);

  const { updateInvoice } = useInvoiceStore();
  const { addEscrow, escrows } = useEscrowStore();
  const masterKey = useUserStore((s) => s.masterKey);

  const [chainArbiter, setChainArbiter] = useState<string | null>(null);
  const [anchors, setAnchors] = useState<InvoiceDetailPageAnchors>({});
  const [isFetchingAnchors, setIsFetchingAnchors] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');

  const chainSyncedRef = useRef<string | null>(null);
  const arbiterQueriedRef = useRef<string | null>(null);

  const displayCurrency = useMemo(() => {
    const inv = detail.invoice;
    return inv?.details?.currency
      ?? (inv?.currencyFlag === CurrencyFlag.USDCX ? 'USDCX' : 'credits');
  }, [detail.invoice]);

  // Query arbiter from on-chain public mapping (authoritative source)
  useEffect(() => {
    const inv = detail.invoice;
    if (!inv?.id) return;
    if (arbiterQueriedRef.current === inv.id) return;
    arbiterQueriedRef.current = inv.id;

    protocolService.getProgramMappingValue(PROGRAM_ID, 'invoice_arbiter', inv.id)
      .then((raw) => {
        if (!raw) return;
        const addr = raw.replace(/"/g, '').trim();
        if (addr && addr !== inv.seller) {
          setChainArbiter(addr);
        }
      })
      .catch(() => {});
  }, [detail.invoice, protocolService]);

  const safeStringify = useCallback(
    (obj: any) => JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2),
    []
  );

  // Fetch registry anchors
  useEffect(() => {
    const fetchAnchors = async () => {
      const inv = detail.invoice;
      if (!inv) return;
      setIsFetchingAnchors(true);
      try {
        const [commitment, fieldCommitments, rules, auth, counter] = await Promise.all([
          registry.getCommitmentRoot(inv.id),
          registry.getFieldCommitments(inv.id),
          registry.getRulesResult(inv.id),
          registry.getAuditAuthorization(inv.id),
          registry.getAuditCounter(inv.seller)
        ]);
        setAnchors({ commitment, fieldCommitments, rules, auth, counter });
      } catch {
        setAnchors({});
      } finally {
        setIsFetchingAnchors(false);
      }
    };
    fetchAnchors();
  }, [detail.invoice, registry]);

  // Auto-sync invoice status and escrow data from chain.
  // Escrow/Dispute operations write to V4 program, so we must query
  // both V3 (via registry) and V4 (direct) invoice_status mappings.
  useEffect(() => {
    const inv = detail.invoice;
    if (!inv) return;
    if (chainSyncedRef.current === inv.id) return;

    chainSyncedRef.current = inv.id;

    const syncFromChain = async () => {
      try {
        // Query both V3.1 and V4 invoice_status mappings in parallel
        const [v3Status, v4Raw] = await Promise.all([
          registry.getInvoiceStatus(inv.id).catch(() => null),
          protocolService.getProgramMappingValue(
            PROGRAM_ID_V4, 'invoice_status', inv.id
          ).catch(() => null),
        ]);

        let v4Status: InvoiceStatus | null = null;
        if (v4Raw) {
          const cleaned = cleanAleoNumber(v4Raw.replace(/"/g, '').trim());
          v4Status = Number(cleaned) as InvoiceStatus;
        }

        // V4 status takes precedence (escrow/dispute updates live there)
        const chainStatus = v4Status ?? v3Status;
        if (chainStatus === null) return;

        console.log('[DetailPage] Chain status query:', {
          invoiceId: inv.id,
          localStatus: InvoiceStatus[inv.status],
          v3Status: v3Status !== null ? InvoiceStatus[v3Status] : null,
          v4Status: v4Status !== null ? InvoiceStatus[v4Status] : null,
          effective: InvoiceStatus[chainStatus],
        });

        if (chainStatus !== inv.status) {
          await updateInvoice(inv.id, {
            status: chainStatus,
            metadata: {
              confirmationStatus: 'CONFIRMED',
              dataSource: 'chain',
              lastUpdated: new Date(),
              action: inv.metadata?.action
            }
          } as any, {
            masterKey: masterKey ?? undefined,
            persistFull: !!masterKey
          });
        }

        const effectiveStatus = chainStatus !== inv.status ? chainStatus : inv.status;

        // Sync escrow data from chain if status indicates escrow involvement
        if (effectiveStatus === InvoiceStatus.ESCROWED ||
            effectiveStatus === InvoiceStatus.PAID ||
            effectiveStatus === InvoiceStatus.REFUNDED) {
          const hasLocalEscrow = escrows.some(e => e.invoiceId === inv.id);
          if (!hasLocalEscrow) {
            const chainEscrow = await escrowService.getChainEscrowData(inv.id);
            if (chainEscrow) {
              const deadline = new Date(inv.dueDate);
              deadline.setDate(deadline.getDate() + 7);

              const escrowRecord: EscrowRecord = {
                escrowId: chainEscrow.escrowId,
                invoiceId: inv.id,
                payer: inv.buyer,
                payee: inv.seller,
                amount: chainEscrow.balance > 0n ? chainEscrow.balance : (inv.totalAmount ?? inv.amount),
                currencyFlag: (inv.currencyFlag ?? 0) as CurrencyFlagType,
                deliveryDeadline: deadline,
                arbiter: (inv.details?.arbiter ?? inv.seller) as AleoAddress,
                status: chainEscrow.status as EscrowStatus,
              };
              addEscrow(escrowRecord);
              console.log('[DetailPage] Escrow record synced from chain:', chainEscrow.escrowId);
            }
          }
        }
      } catch (err) {
        console.warn('[DetailPage] Chain sync failed (non-fatal):', err);
      }
    };

    syncFromChain();
  }, [detail.invoice, registry, protocolService, escrowService, updateInvoice, addEscrow, escrows, masterKey]);

  const handleDownloadPackage = useCallback(async (mode: 'minimal' | 'full') => {
    const inv = detail.invoice;
    if (!inv) return;
    setDownloadMsg('');
    try {
      const fields =
        mode === 'minimal'
          ? ['amount', 'tax_amount', 'due_date', 'buyer', 'seller']
          : ['amount', 'tax_amount', 'due_date', 'buyer', 'seller', 'currency', 'items_hash', 'memo_hash', 'order_id'];
      const pkg = await generate({
        invoiceId: inv.id,
        selectedFields: fields,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000
      });
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-package-${mode}-${inv.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadMsg(`Generated ${mode} package`);
    } catch (e: any) {
      setDownloadMsg(e?.message ?? 'Failed to generate package');
    }
  }, [detail.invoice, generate]);

  return {
    ...detail,
    displayCurrency,
    chainArbiter,
    anchors,
    isFetchingAnchors,
    downloadMsg,
    safeStringify,
    handleDownloadPackage
  };
}
