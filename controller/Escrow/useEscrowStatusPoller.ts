'use client';

import { useState, useCallback, useRef } from 'react';
import { useInvoicePollingCore } from '@/controller/Invoice/useInvoicePollingCore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useEscrowStore } from '@/stores/Escrow/useEscrowStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { Invoice, InvoiceStatus, EscrowStatus, AleoField } from '@/lib/types';

const POLL_INTERVAL_MS = 12_000; // 12 seconds
const POLL_TIMEOUT_MS  = 180_000; // 3 minutes

export type EscrowOperation = 'confirm_delivery' | 'timeout_refund' | 'arbiter_resolve' | 'dispute_dismiss' | 'dispute_uphold';

/** Derives the expected InvoiceStatus and EscrowStatus from the operation. */
function expectedStatuses(
  op: EscrowOperation,
  decision?: 'release' | 'refund'
): { invoiceStatus: InvoiceStatus; escrowStatus: EscrowStatus } {
  if (op === 'confirm_delivery' || (op === 'arbiter_resolve' && decision === 'release')) {
    return { invoiceStatus: InvoiceStatus.PAID, escrowStatus: EscrowStatus.RELEASED };
  }
  if (op === 'dispute_dismiss') {
    return { invoiceStatus: InvoiceStatus.RESOLVED_CANCELLED, escrowStatus: EscrowStatus.LOCKED };
  }
  if (op === 'dispute_uphold') {
    return { invoiceStatus: InvoiceStatus.REFUNDED, escrowStatus: EscrowStatus.REFUNDED };
  }
  return { invoiceStatus: InvoiceStatus.REFUNDED, escrowStatus: EscrowStatus.REFUNDED };
}

export interface EscrowPollerState {
  isPolling: boolean;
  pollPhase: 'idle' | 'chain'; // 'chain' = waiting for on-chain mapping update
  pollLog: string;
}

export interface StartEscrowPollParams {
  invoice: Invoice;
  escrowId: AleoField;
  operation: EscrowOperation;
  decision?: 'release' | 'refund';
  onConfirmed?: () => void;
  onTimeout?: () => void;
}

/**
 * Polls the public `invoice_status` mapping (V4 program) after an escrow
 * transition is submitted to the wallet.  Updates local stores once the
 * chain mapping reflects the expected final status.
 */
export function useEscrowStatusPoller() {
  const [state, setState] = useState<EscrowPollerState>({
    isPolling: false,
    pollPhase: 'idle',
    pollLog: '',
  });

  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const { getChainInvoiceStatus } = useInvoicePollingCore();
  const invoiceStore = useInvoiceStore();
  const escrowStore  = useEscrowStore();
  const masterKey    = useUserStore((s) => s.masterKey);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setState({ isPolling: false, pollPhase: 'idle', pollLog: '' });
  }, []);

  const startPolling = useCallback(
    ({
      invoice,
      escrowId,
      operation,
      decision,
      onConfirmed,
      onTimeout,
    }: StartEscrowPollParams) => {
      const { invoiceStatus: expectedInvoice, escrowStatus: expectedEscrow } =
        expectedStatuses(operation, decision);

      startTimeRef.current = Date.now();
      setState({ isPolling: true, pollPhase: 'chain', pollLog: 'Waiting for on-chain confirmation…' });

      const poll = async () => {
        const elapsed = Date.now() - startTimeRef.current;
        if (elapsed > POLL_TIMEOUT_MS) {
          stopPolling();
          onTimeout?.();
          return;
        }

        try {
          const chainStatus = await getChainInvoiceStatus(invoice.id);
          if (chainStatus === expectedInvoice) {
            // ✅ Chain confirmed — update local stores
            await invoiceStore.updateInvoice(
              invoice.id,
              {
                status: expectedInvoice,
                metadata: {
                  confirmationStatus: 'CONFIRMED',
                  dataSource: 'chain',
                  lastUpdated: new Date(),
                  action: invoice.metadata?.action,
                },
              },
              { masterKey: masterKey ?? undefined }
            );
            escrowStore.updateEscrow(escrowId, { status: expectedEscrow });
            stopPolling();
            onConfirmed?.();
          } else {
            const elapsed2 = Math.round((Date.now() - startTimeRef.current) / 1000);
            setState((s) => ({
              ...s,
              pollLog: `Confirming on chain… (${elapsed2}s elapsed)`,
            }));
          }
        } catch {
          setState((s) => ({ ...s, pollLog: 'Retrying confirmation…' }));
        }
      };

      // Run immediately, then at interval
      poll();
      timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    },
    [getChainInvoiceStatus, invoiceStore, escrowStore, masterKey, stopPolling]
  );

  return { ...state, startPolling, stopPolling };
}
