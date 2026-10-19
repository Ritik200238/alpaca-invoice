'use client';

import { useCallback, useState } from 'react';
import type { IDisputeController } from './IDisputeController';
import type {
  AleoAddress,
  AleoTransactionId,
  RaiseDisputeParams,
  ResolveDisputeParams,
  SubmitEvidenceParams,
  DisputeRecord,
  DisputeStatus,
  AleoField,
} from '@/lib/types';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useDisputeStore } from '@/stores/Dispute/useDisputeStore';

export function useDisputeController(): IDisputeController {
  const txController = useTransactionController();
  const disputeStore = useDisputeStore();
  const [log, setLog] = useState('');

  const executeRaiseDispute = useCallback(async (params: RaiseDisputeParams): Promise<AleoTransactionId> => {
    const { InvoiceStatus } = await import('@/lib/types');
    if (params.invoice.status !== InvoiceStatus.ESCROWED) {
      throw new Error('Disputes can only be raised when the invoice is in ESCROWED status. Please pay via Escrow first.');
    }
    const arbiter = params.arbiter ?? params.invoice.details?.arbiter;
    if (!arbiter) {
      throw new Error('Arbiter address is required. The seller must set an arbiter when creating the invoice.');
    }
    setLog('Raising dispute...');
    try {
      const txId = await txController.executeRaiseDispute(params);

      const nowSec = Math.floor(Date.now() / 1000);
      const deadlineSec = nowSec + params.resolutionDeadlineDays * 86400;

      const dispute: DisputeRecord = {
        disputeId: `${txId}field` as AleoField,
        invoiceId: params.invoice.id,
        disputant: params.invoice.buyer,
        arbiter: (params.arbiter ?? params.invoice.details?.arbiter)! as AleoAddress,
        reasonHash: params.reasonHash,
        evidenceHash: params.evidenceHash,
        status: 0 as DisputeStatus,
        createdAt: new Date(),
        resolutionDeadline: new Date(deadlineSec * 1000),
        reasonText: params.reasonText,
      };

      disputeStore.addDispute(dispute);

      if (params.reasonText) {
        fetch('/api/dispute-reason', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: params.invoice.id, reasonText: params.reasonText }),
        }).catch((e) => console.warn('[Dispute] Failed to save reason to KV:', e));
      }

      setLog('Dispute raised successfully');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController, disputeStore]);

  const executeResolveDispute = useCallback(async (params: ResolveDisputeParams): Promise<AleoTransactionId> => {
    setLog('Resolving dispute...');
    try {
      const txId = await txController.executeResolveDispute(params);
      setLog('Dispute transaction submitted — awaiting on-chain confirmation');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController]);

  const executeSubmitEvidence = useCallback(async (params: SubmitEvidenceParams): Promise<AleoTransactionId> => {
    setLog('Submitting evidence...');
    try {
      const txId = await txController.executeSubmitEvidence(params);
      disputeStore.updateDispute(params.dispute.disputeId, {
        evidenceHash: params.newEvidenceHash,
      });
      setLog('Evidence submitted');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController, disputeStore]);

  return {
    isProcessing: txController.isProcessing,
    currentLog: log,
    executeRaiseDispute,
    executeResolveDispute,
    executeSubmitEvidence,
  };
}
