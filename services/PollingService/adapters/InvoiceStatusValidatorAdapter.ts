/**
 * 发票状态验证适配器
 * 将 InvoiceStatusValidator 适配为 PollingService 的验证函数
 */
import { IInvoiceStatusValidator } from '@/services/InvoiceStatusValidator/IInvoiceStatusValidator';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { Invoice } from '@/lib/types';
import { ValidationResult } from '../IPollingService';

export interface InvoiceScanResult {
  invoiceRecord: AleoInvoiceRecord | null;
  paymentRecord: AleoPaymentRecord | null;
}

/**
 * 创建发票验证适配器
 * @param validator 发票状态验证服务
 * @param invoice 发票对象
 * @returns 适配后的验证函数
 */
export function createInvoiceValidationAdapter(
  validator: IInvoiceStatusValidator,
  invoice: Invoice
): (result: InvoiceScanResult) => ValidationResult {
  return (result: InvoiceScanResult): ValidationResult => {
    // Only confirm when we have InvoiceRecord (invoice amount/status must come from it, not PaymentRecord)
    if (result.invoiceRecord) {
      const validation = validator.validateRecord(
        result.invoiceRecord,
        invoice.metadata?.action,
        invoice.status
      );
      return {
        shouldStop: validation.shouldConfirm,
        reason: validation.reason,
        shouldContinue: !validation.shouldConfirm
      };
    }
    if (result.paymentRecord) {
      return { shouldStop: false, reason: 'Waiting for InvoiceRecord', shouldContinue: true };
    }
    return { shouldStop: false, reason: 'No record found', shouldContinue: true };
  };
}

