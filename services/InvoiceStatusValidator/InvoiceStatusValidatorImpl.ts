import { IInvoiceStatusValidator, RecordValidationResult } from './IInvoiceStatusValidator';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { InvoiceStatus } from '@/lib/types';
import { cleanAleoNumber } from '@/lib/utils';

/**
 * Invoice status validation
 * Purpose: decide whether a chain record matches the expected status based on action.
 */
export class InvoiceStatusValidator implements IInvoiceStatusValidator {
  validateRecord(
    record: AleoInvoiceRecord | AleoPaymentRecord | null,
    action: 'create' | 'cancel' | 'pay' | undefined,
    originalInvoiceStatus: InvoiceStatus
  ): RecordValidationResult {
    if (!record) {
      return { 
        shouldConfirm: false, 
        reason: 'No record found' 
      };
    }

    if ('payment_id' in record) {
      return { 
        shouldConfirm: true, 
        reason: 'PaymentRecord found (indicates paid)' 
      };
    }

    const invoiceRecord = record as AleoInvoiceRecord;
    const recordStatus = Number(cleanAleoNumber(invoiceRecord.status));

    return this.validateInvoiceRecord(
      recordStatus,
      action,
      originalInvoiceStatus
    );
  }

  private validateInvoiceRecord(
    recordStatus: InvoiceStatus,
    action: 'create' | 'cancel' | 'pay' | undefined,
    originalInvoiceStatus: InvoiceStatus
  ): RecordValidationResult {
    if (action === 'cancel') {
      if (recordStatus === InvoiceStatus.CANCELLED) {
        return { 
          shouldConfirm: true, 
          reason: 'Cancellation confirmed',
          currentStatus: recordStatus,
          expectedStatus: InvoiceStatus.CANCELLED
        };
      }
      return {
        shouldConfirm: false,
        reason: 'Waiting for status to change to CANCELLED',
        currentStatus: recordStatus,
        expectedStatus: InvoiceStatus.CANCELLED
      };
    }

    if (action === 'pay') {
      if (recordStatus === InvoiceStatus.PAID) {
        return {
          shouldConfirm: true,
          reason: 'Payment confirmed',
          currentStatus: recordStatus,
          expectedStatus: InvoiceStatus.PAID
        };
      }
      return {
        shouldConfirm: false,
        reason: 'Waiting for status to change to PAID',
        currentStatus: recordStatus,
        expectedStatus: InvoiceStatus.PAID
      };
    }

    if (action === 'create') {
      return {
        shouldConfirm: true,
        reason: 'Invoice created and found on chain',
        currentStatus: recordStatus
      };
    }

    if (originalInvoiceStatus === InvoiceStatus.PENDING && 
        recordStatus === InvoiceStatus.PENDING) {
      return {
        shouldConfirm: true,
        reason: 'Invoice found on chain with matching status',
        currentStatus: recordStatus
      };
    }

    return {
      shouldConfirm: true,
      reason: 'Status changed, confirming',
      currentStatus: recordStatus
    };
  }
}
