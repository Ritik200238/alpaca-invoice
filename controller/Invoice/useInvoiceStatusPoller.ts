'use client';

import { useState, useCallback, useRef } from 'react';
import { useInvoicePollingCore } from '@/controller/Invoice/useInvoicePollingCore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';
import { AleoField, InvoiceStatus } from '@/lib/types';

const POLL_INTERVAL_MS = 12_000;
const POLL_TIMEOUT_MS  = 180_000;

export interface InvoicePollerState {
  isPolling: boolean;
  pollLog: string;
}

export interface StartInvoicePollParams {
  invoiceId: AleoField;
  invoiceHash: AleoField;
  expectedStatus: InvoiceStatus;
  onConfirmed?: () => void;
  onTimeout?: () => void;
}

/**
 * Generic invoice-status poller for Pay / Cancel / Create operations.
 * Polls the public `invoice_status` mapping (V3 + V4) until the expected
 * status is reached, then updates the local invoice store.
 */
export function useInvoiceStatusPoller() {
  const [state, setState] = useState<InvoicePollerState>({
    isPolling: false,
    pollLog: '',
  });

  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const { getChainInvoiceStatus } = useInvoicePollingCore();
  const invoiceStore = useInvoiceStore();
  const masterKey    = useUserStore((s) => s.masterKey);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setState({ isPolling: false, pollLog: '' });
  }, []);

  const startPolling = useCallback(
    ({
      invoiceId,
      invoiceHash,
      expectedStatus,
      onConfirmed,
      onTimeout,
    }: StartInvoicePollParams) => {
      startTimeRef.current = Date.now();
      setState({ isPolling: true, pollLog: 'Waiting for on-chain confirmation…' });

      const poll = async () => {
        const elapsed = Date.now() - startTimeRef.current;
        if (elapsed > POLL_TIMEOUT_MS) {
          invoiceStore.markInvoiceConfirmed(invoiceHash);
          stopPolling();
          onTimeout?.();
          return;
        }

        try {
          const chainStatus = await getChainInvoiceStatus(invoiceId);
          if (chainStatus === expectedStatus) {
            await invoiceStore.updateInvoice(
              invoiceId,
              {
                status: expectedStatus,
                metadata: {
                  confirmationStatus: 'CONFIRMED',
                  dataSource: 'chain',
                  lastUpdated: new Date(),
                },
              },
              { masterKey: masterKey ?? undefined }
            );
            invoiceStore.markInvoiceConfirmed(invoiceHash);
            stopPolling();
            onConfirmed?.();
          } else {
            const elapsedSec = Math.round((Date.now() - startTimeRef.current) / 1000);
            setState((s) => ({
              ...s,
              pollLog: `Confirming on chain… (${elapsedSec}s elapsed)`,
            }));
          }
        } catch {
          setState((s) => ({ ...s, pollLog: 'Retrying confirmation…' }));
        }
      };

      poll();
      timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    },
    [getChainInvoiceStatus, invoiceStore, masterKey, stopPolling]
  );

  return { ...state, startPolling, stopPolling };
}
