import { useCallback, useState } from 'react';
import { useTransactionController } from '@/controller/Transaction/useTransactionController';
import { useErrorHandler } from '@/controller/Error/useErrorHandler';
import { useInvoiceStore } from '@/stores/Invoice/useInoviceStore';
import { Invoice, AleoField } from '@/lib/types';
import type { InvoiceState } from '@/stores/Invoice/InvoiceState';
import { toast } from 'sonner';

/**
 * Hook: invoice actions (pay / cancel)
 *
 * Usage:
 * - useInvoiceActions(invoice, onSync) - handlePay() and handleCancel() operate on the provided invoice
 *
 * Responsibilities:
 * - Execute payment
 * - Execute cancellation
 * - Manage processing state
 * - Mark invoice as SENDING after success (triggers AutoPoller)
 */
export function useInvoiceActions(
  invoice: Invoice | null,
  onSyncAfterAction?: () => Promise<void>
) {
  const { executePay, executeCancel } = useTransactionController();
  const { handleError } = useErrorHandler();
  const markInvoiceSending = useInvoiceStore(
    (state: InvoiceState) => state.markInvoiceSending
  );
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Process payment using the invoice provided to the hook.
   * Marks the invoice as SENDING to trigger the global AutoPoller.
   * @returns true if the transaction was submitted successfully
   */
  const handlePay = useCallback(async (): Promise<boolean> => {
    if (!invoice) {
      toast.error('Payment failed', {
        description: 'Invoice data not available. Please try again.'
      });
      return false;
    }
    
    setIsProcessing(true);
    try {
      toast.loading('Processing payment...', { id: `pay-${invoice.id}` });
      const transactionId = await executePay(invoice);
      
      markInvoiceSending(invoice.invoiceHash);
      
      toast.success('Payment successful!', {
        id: `pay-${invoice.id}`,
        description: `Transaction ID: ${transactionId.slice(0, 16)}...`
      });
      
      return true;
    } catch (error) {
      toast.error('Payment failed', {
        id: `pay-${invoice.id}`,
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      handleError(error as Error);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [invoice, executePay, markInvoiceSending, handleError]);

  /**
   * Process cancellation using the invoice provided to the hook.
   * Marks the invoice as SENDING to trigger the global AutoPoller.
   * @returns true if the transaction was submitted successfully
   */
  const handleCancel = useCallback(async (): Promise<boolean> => {
    if (!invoice) {
      toast.error('Cancellation failed', {
        description: 'Invoice data not available. Please try again.'
      });
      return false;
    }
    
    setIsProcessing(true);
    try {
      toast.loading('Cancelling invoice...', { id: `cancel-${invoice.id}` });
      const transactionId = await executeCancel(invoice);
      
      markInvoiceSending(invoice.invoiceHash);
      
      toast.success('Invoice cancelled successfully', { 
        id: `cancel-${invoice.id}`,
        description: `Transaction ID: ${transactionId.slice(0, 16)}...`
      });
      
      return true;
    } catch (error) {
      toast.error('Failed to cancel invoice', {
        id: `cancel-${invoice.id}`,
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      handleError(error as Error);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [invoice, executeCancel, markInvoiceSending, handleError]);

  return {
    isProcessing,
    handlePay,
    handleCancel
  };
}
