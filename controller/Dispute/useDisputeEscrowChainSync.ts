'use client';

import { useCallback, useMemo, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useUserStore } from '@/stores/User/useUserStore';
import { useDisputeStore } from '@/stores/Dispute/useDisputeStore';
import { useEscrowStore } from '@/stores/Escrow/useEscrowStore';
import { WalletService } from '@/services/WalletService/WalletServiceImpl';
import { createWalletAdapter } from '@/services/WalletService/createWalletAdapter';
import { AleoProtocolService } from '@/services/AleoProtocolService/AleoProtocolServiceImpl';
import { PROGRAM_ID_V4 } from '@/lib/contract';
import type { AleoField, AleoAddress, DisputeRecord, EscrowRecord } from '@/lib/types';
import { DisputeStatus, EscrowStatus, CurrencyFlag } from '@/lib/types';
import { cleanAleoNumber } from '@/lib/utils';

/**
 * Extract a field value from an Aleo record (structured or plaintext).
 * Strips `.private` / `.public` suffixes.
 */
function extractField(record: any, fieldName: string): string | undefined {
  const fromData = record?.data?.[fieldName] ?? record?.[fieldName];
  if (fromData !== undefined && fromData !== null) {
    return String(fromData).replace(/\.(private|public)$/, '').trim();
  }
  const plaintext: string | undefined =
    record?.plaintext ?? record?.recordPlaintext ?? record?.record_plaintext;
  if (typeof plaintext === 'string') {
    const re = new RegExp(`\\b${fieldName}\\s*:\\s*([^,}\\s]+)`);
    const m = plaintext.match(re);
    if (m) return m[1].replace(/\.(private|public)$/, '').trim();
  }
  return undefined;
}

function isDisputeRecord(record: any): boolean {
  const name = record?.recordName ?? record?.record_name;
  if (name === 'DisputeRecord') return true;
  return !!(extractField(record, 'dispute_id') && extractField(record, 'disputant'));
}

function isEscrowRecord(record: any): boolean {
  const name = record?.recordName ?? record?.record_name;
  if (name === 'EscrowRecord') return true;
  return !!(extractField(record, 'escrow_id') && extractField(record, 'payer') && extractField(record, 'payee'));
}

function parseDisputeFromChain(record: any): DisputeRecord | null {
  try {
    const disputeId = extractField(record, 'dispute_id');
    const invoiceId = extractField(record, 'invoice_id');
    const disputant = extractField(record, 'disputant');
    const arbiter = extractField(record, 'arbiter');
    const reasonHash = extractField(record, 'reason_hash');
    const evidenceHash = extractField(record, 'evidence_hash');
    const statusRaw = extractField(record, 'status');
    const createdAtRaw = extractField(record, 'created_at');
    const deadlineRaw = extractField(record, 'resolution_deadline');

    if (!disputeId || !invoiceId || !disputant || !arbiter) return null;

    const statusNum = Number(cleanAleoNumber(statusRaw ?? '0'));
    const createdAtSec = Number(cleanAleoNumber(createdAtRaw ?? '0'));
    const deadlineSec = Number(cleanAleoNumber(deadlineRaw ?? '0'));

    return {
      disputeId: disputeId as AleoField,
      invoiceId: invoiceId as AleoField,
      disputant: disputant as AleoAddress,
      arbiter: arbiter as AleoAddress,
      reasonHash: (reasonHash ?? '0field') as AleoField,
      evidenceHash: (evidenceHash ?? '0field') as AleoField,
      status: statusNum as DisputeStatus,
      createdAt: new Date(createdAtSec * 1000),
      resolutionDeadline: new Date(deadlineSec * 1000),
    };
  } catch {
    return null;
  }
}

function parseEscrowFromChain(record: any): EscrowRecord | null {
  try {
    const escrowId = extractField(record, 'escrow_id');
    const invoiceId = extractField(record, 'invoice_id');
    const payer = extractField(record, 'payer');
    const payee = extractField(record, 'payee');
    const amountRaw = extractField(record, 'amount');
    const currencyFlagRaw = extractField(record, 'currency_flag');
    const deadlineRaw = extractField(record, 'delivery_deadline');
    const arbiter = extractField(record, 'arbiter');
    const statusRaw = extractField(record, 'status');

    if (!escrowId || !invoiceId || !payer || !payee) return null;

    const amount = BigInt(cleanAleoNumber(amountRaw ?? '0'));
    const deadlineSec = Number(cleanAleoNumber(deadlineRaw ?? '0'));
    const statusNum = Number(cleanAleoNumber(statusRaw ?? '0'));
    const currencyFlag = Number(cleanAleoNumber(currencyFlagRaw ?? '0'));

    return {
      escrowId: escrowId as AleoField,
      invoiceId: invoiceId as AleoField,
      payer: payer as AleoAddress,
      payee: payee as AleoAddress,
      amount,
      currencyFlag: currencyFlag as CurrencyFlag,
      deliveryDeadline: new Date(deadlineSec * 1000),
      arbiter: arbiter as AleoAddress,
      status: statusNum as EscrowStatus,
    };
  } catch {
    return null;
  }
}

function isStatusResolved(status: DisputeStatus): boolean {
  return status === DisputeStatus.RESOLVED_CANCEL || status === DisputeStatus.RESOLVED_PAY;
}

export function useDisputeEscrowChainSync() {
  const wallet = useWallet();
  const { publicKey } = useUserStore();
  const disputeStore = useDisputeStore();
  const escrowStore = useEscrowStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  const walletService = useMemo(() => {
    if (!wallet) return null;
    return new WalletService(createWalletAdapter(wallet));
  }, [wallet]);

  const protocolService = useMemo(() => new AleoProtocolService(), []);

  const isWalletReady = useCallback(
    () => !!(wallet?.connected && wallet?.address),
    [wallet?.connected, wallet?.address]
  );

  /**
   * Query the public dispute_status mapping on chain for a given disputeId.
   * Returns the DisputeStatus or null if no mapping entry exists.
   */
  const getChainDisputeStatus = useCallback(async (disputeId: AleoField): Promise<DisputeStatus | null> => {
    try {
      const raw = await protocolService.getProgramMappingValue(
        PROGRAM_ID_V4, 'dispute_status', disputeId
      );
      if (!raw) return null;
      const cleaned = cleanAleoNumber(raw.replace(/"/g, '').trim());
      return Number(cleaned) as DisputeStatus;
    } catch {
      return null;
    }
  }, [protocolService]);

  const syncFromChain = useCallback(async () => {
    if (!walletService || !publicKey || !isWalletReady()) {
      console.warn('[DisputeEscrowSync] Wallet not ready, skipping sync');
      return { disputes: 0, escrows: 0 };
    }

    setIsSyncing(true);

    try {
      const response = await walletService.requestRecords(PROGRAM_ID_V4);
      const records: any[] = response?.records ?? [];
      console.log(`[DisputeEscrowSync] Found ${records.length} records from ${PROGRAM_ID_V4}`);

      let disputeCount = 0;
      let escrowCount = 0;

      // Phase 1: Collect all unspent chain disputes, deduplicate by invoiceId
      const chainDisputesByInvoice = new Map<string, DisputeRecord>();
      for (const record of records) {
        const isSpent = record?.spent === true || record?.spent === 'true';

        if (isDisputeRecord(record) && !isSpent) {
          const parsed = parseDisputeFromChain(record);
          if (parsed) {
            chainDisputesByInvoice.set(parsed.invoiceId, parsed);
          }
        }

        if (isEscrowRecord(record) && !isSpent) {
          const parsed = parseEscrowFromChain(record);
          if (parsed) {
            const existing = useEscrowStore.getState().escrows.find(
              (e) => e.escrowId === parsed.escrowId
            );
            if (!existing) {
              escrowStore.addEscrow(parsed);
              escrowCount++;
            } else if (existing.status !== parsed.status) {
              escrowStore.updateEscrow(parsed.escrowId, {
                status: parsed.status,
              });
              escrowCount++;
            }
          }
        }
      }

      // Phase 2: Merge chain disputes into the store
      // IMPORTANT: Never downgrade status (RESOLVED → OPEN is forbidden)
      for (const [invoiceId, chainDispute] of chainDisputesByInvoice) {
        const currentDisputes = useDisputeStore.getState().disputes;

        const duplicates = currentDisputes.filter(
          (d) => d.invoiceId === invoiceId && d.disputeId !== chainDispute.disputeId
        );
        let preservedReasonText: string | undefined;
        for (const dup of duplicates) {
          if (dup.reasonText) preservedReasonText = dup.reasonText;
          disputeStore.removeDispute(dup.disputeId);
        }

        const exactMatch = useDisputeStore.getState().disputes.find(
          (d) => d.disputeId === chainDispute.disputeId
        );
        if (exactMatch) {
          const updates: Partial<DisputeRecord> = {};

          // Guard: never downgrade from resolved → open
          if (exactMatch.status !== chainDispute.status) {
            if (isStatusResolved(exactMatch.status) && !isStatusResolved(chainDispute.status)) {
              // Local says resolved but chain record (stale wallet cache) says OPEN — skip
              console.log(`[DisputeEscrowSync] Skipping status downgrade for ${chainDispute.disputeId}`);
            } else {
              updates.status = chainDispute.status;
              updates.evidenceHash = chainDispute.evidenceHash;
            }
          }
          if (!exactMatch.reasonText && preservedReasonText) {
            updates.reasonText = preservedReasonText;
          }
          if (Object.keys(updates).length > 0) {
            disputeStore.updateDispute(chainDispute.disputeId, updates);
            disputeCount++;
          }
        } else {
          const merged: DisputeRecord = {
            ...chainDispute,
            reasonText: preservedReasonText,
          };
          disputeStore.addDispute(merged);
          disputeCount++;
        }
      }

      // Phase 3: Reconcile ALL local OPEN disputes against the public dispute_status mapping.
      //
      // Why check ALL OPEN disputes, not just orphans?
      // - resolve_dispute consumes only the arbiter's DisputeRecord, NOT the buyer's/seller's
      // - The buyer/seller still have unspent DisputeRecords with status=OPEN (record data never changes)
      // - Only the public dispute_status mapping reflects the true resolved status
      // - So we must query the mapping for every OPEN dispute to catch resolutions
      const localDisputes = useDisputeStore.getState().disputes;
      const stillOpen = localDisputes.filter((d) => d.status === DisputeStatus.OPEN);

      if (stillOpen.length > 0) {
        const statusChecks = await Promise.allSettled(
          stillOpen.map((d) =>
            getChainDisputeStatus(d.disputeId).then((status) => ({ dispute: d, status }))
          )
        );

        for (const result of statusChecks) {
          if (result.status !== 'fulfilled') continue;
          const { dispute, status } = result.value;
          if (status !== null && status !== DisputeStatus.OPEN) {
            console.log(
              `[DisputeEscrowSync] Mapping reconciliation: ${dispute.disputeId} local=OPEN → chain=${DisputeStatus[status]}`
            );
            disputeStore.updateDispute(dispute.disputeId, { status });
            disputeCount++;
          }
        }
      }

      setLastSyncAt(new Date());
      console.log(`[DisputeEscrowSync] Synced ${disputeCount} dispute(s), ${escrowCount} escrow(s)`);
      return { disputes: disputeCount, escrows: escrowCount };
    } catch (err) {
      console.error('[DisputeEscrowSync] Sync failed:', err);
      return { disputes: 0, escrows: 0 };
    } finally {
      setIsSyncing(false);
    }
  }, [walletService, publicKey, isWalletReady, disputeStore, escrowStore, getChainDisputeStatus]);

  return {
    syncFromChain,
    isSyncing,
    lastSyncAt,
  };
}
