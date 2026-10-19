import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { InvoiceStatus } from '@/lib/types';

/**
 * Invoice status validation result
 */
export interface RecordValidationResult {
  shouldConfirm: boolean;
  reason: string;
  expectedStatus?: InvoiceStatus;
  currentStatus?: InvoiceStatus;
}

/**
 * Invoice status validation service interface
 * Responsibility: validate whether on-chain records match the expected status based on the action type
 */
export interface IInvoiceStatusValidator {
  /**
   * Validate whether a record matches the expected status
   * @param record On-chain record (InvoiceRecord or PaymentRecord)
   * @param action Current action type (create/cancel/pay)
   * @param originalInvoiceStatus Original status of the invoice
   * @returns Validation result
   */
  validateRecord(
    record: AleoInvoiceRecord | AleoPaymentRecord | null,
    action: 'create' | 'cancel' | 'pay' | undefined,
    originalInvoiceStatus: InvoiceStatus
  ): RecordValidationResult;
}

