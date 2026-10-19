'use client';

import { useCallback, useState } from 'react';
import type { IEscrowController } from './IEscrowController';
import type {
  AleoAddress,
  AleoTransactionId,
  EscrowPaymentParams,
  ConfirmDeliveryParams,
  TimeoutRefundParams,
  ArbiterResolveParams,
  EscrowRecord,
  EscrowStatus,
  AleoField,
  CurrencyFlag,
} from '@/lib/types';
import { InvoiceStatus } from '@/lib/types';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useEscrowStore } from '@/stores/Escrow/useEscrowStore';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { useUserStore } from '@/stores/User/useUserStore';

export function useEscrowController(): IEscrowController {
  const txController = useTransactionController();
  const escrowStore = useEscrowStore();
  const invoiceStore = useInvoiceStore();
  const masterKey = useUserStore((s) => s.masterKey); // still used in executeEscrowPayment
  const [log, setLog] = useState('');

  const executeEscrowPayment = useCallback(async (params: EscrowPaymentParams): Promise<AleoTransactionId> => {
    const arbiter = params.escrowConfig.arbiter ?? params.invoice.details?.arbiter;
    if (!arbiter) {
      throw new Error('Arbiter address is required for escrow payment. The seller must set an arbiter when creating the invoice.');
    }
    if (arbiter === params.invoice.seller) {
      throw new Error('Arbiter cannot be the same as the seller.');
    }
    setLog('Locking payment in escrow...');
    try {
      const txId = await txController.executeEscrowPayment(params);

      const escrow: EscrowRecord = {
        escrowId: `${txId}field` as AleoField,
        invoiceId: params.invoice.id,
        payer: params.invoice.buyer,
        payee: params.invoice.seller,
        amount: params.invoice.totalAmount ?? params.invoice.amount,
        currencyFlag: params.invoice.currencyFlag ?? (0 as CurrencyFlag),
        deliveryDeadline: params.escrowConfig.deliveryDeadline,
        arbiter: (params.escrowConfig.arbiter ?? params.invoice.details?.arbiter)! as AleoAddress,
        status: 0 as EscrowStatus,
      };

      escrowStore.addEscrow(escrow);
      invoiceStore.updateInvoice(
        params.invoice.id,
        { status: InvoiceStatus.ESCROWED },
        { masterKey: masterKey ?? undefined }
      );
      setLog('Payment locked in escrow');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController, escrowStore, invoiceStore, masterKey]);

  const executeConfirmDelivery = useCallback(async (params: ConfirmDeliveryParams): Promise<AleoTransactionId> => {
    setLog('Confirming delivery and releasing funds...');
    try {
      const txId = await txController.executeConfirmDelivery(params);
      // Do NOT optimistically set status to RELEASED here.
      // requestTransaction resolves as soon as the wallet queues the request, not when the
      // transaction is confirmed on-chain. If we update state here and the wallet later fails
      // to prove/submit, the local state is permanently out of sync with the chain.
      // Actual status update (RELEASED / PAID) will be applied by the sync/polling mechanism
      // once on-chain confirmation is observed.
      setLog('Delivery confirmation submitted – awaiting on-chain confirmation');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController]);

  const executeTimeoutRefund = useCallback(async (params: TimeoutRefundParams): Promise<AleoTransactionId> => {
    setLog('Processing timeout refund...');
    try {
      const txId = await txController.executeTimeoutRefund(params);
      // Same reasoning as executeConfirmDelivery – wait for chain confirmation via sync.
      setLog('Refund request submitted – awaiting on-chain confirmation');
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController]);

  const executeArbiterResolve = useCallback(async (params: ArbiterResolveParams): Promise<AleoTransactionId> => {
    setLog('Arbiter resolving escrow...');
    try {
      const txId = await txController.executeArbiterResolve(params);
      // Same reasoning – do not apply final state until chain confirms.
      setLog(`Arbiter ${params.decision} submitted – awaiting on-chain confirmation`);
      return txId;
    } catch (error) {
      setLog('');
      throw error;
    }
  }, [txController]);

  return {
    isProcessing: txController.isProcessing,
    currentLog: log,
    executeEscrowPayment,
    executeConfirmDelivery,
    executeTimeoutRefund,
    executeArbiterResolve,
  };
}
