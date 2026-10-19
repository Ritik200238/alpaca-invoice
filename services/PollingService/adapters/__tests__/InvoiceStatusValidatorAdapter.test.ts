import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createInvoiceValidationAdapter, InvoiceScanResult } from '../InvoiceStatusValidatorAdapter';
import { IInvoiceStatusValidator } from '@/services/InvoiceStatusValidator/IInvoiceStatusValidator';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { Invoice, InvoiceStatus } from '@/lib/types';

describe('InvoiceStatusValidatorAdapter', () => {
  let mockValidator: IInvoiceStatusValidator;
  let mockInvoice: Invoice;

  beforeEach(() => {
    mockValidator = {
      validateRecord: vi.fn()
    } as any;

    mockInvoice = {
      id: 'invoice123field' as any,
      seller: 'aleo1seller',
      buyer: 'aleo1buyer',
      amount: BigInt('1000000'),
      invoiceHash: 'hash123field' as any,
      dueDate: new Date(),
      createdAt: new Date(),
      status: InvoiceStatus.PENDING,
      metadata: {
        confirmationStatus: 'SENDING',
        lastUpdated: new Date(),
        dataSource: 'local',
        action: 'create'
      }
    };
  });

  describe('createInvoiceValidationAdapter', () => {
    it('应该返回一个验证函数', () => {
      // Act
      const adapter = createInvoiceValidationAdapter(mockValidator, mockInvoice);

      // Assert
      expect(typeof adapter).toBe('function');
    });

    it('当没有找到任何记录时，应该返回 shouldStop: false 和 shouldContinue: true', () => {
      // Arrange
      const adapter = createInvoiceValidationAdapter(mockValidator, mockInvoice);
      const scanResult: InvoiceScanResult = {
        invoiceRecord: null,
        paymentRecord: null
      };

      // Act
      const result = adapter(scanResult);

      // Assert
      expect(result.shouldStop).toBe(false);
      expect(result.shouldContinue).toBe(true);
      expect(result.reason).toBe('No record found');
      expect(mockValidator.validateRecord).not.toHaveBeenCalled();
    });

    it('应该优先使用 invoiceRecord 进行验证（invoice 包含 status/amount 权威数据）', () => {
      // Arrange
      const paymentRecord: AleoPaymentRecord = {
        owner: 'aleo1test',
        payment_id: 'payment123field',
        invoice_id: 'invoice123field',
        amount: '1000000',
        payer: 'aleo1buyer',
        payee: 'aleo1seller',
        paid_at: 1234567890
      };

      const invoiceRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '0u8' as any,
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      const scanResult: InvoiceScanResult = {
        invoiceRecord,
        paymentRecord
      };

      (mockValidator.validateRecord as any).mockReturnValue({
        shouldConfirm: true,
        reason: 'Payment confirmed'
      });

      const adapter = createInvoiceValidationAdapter(mockValidator, mockInvoice);

      // Act
      const result = adapter(scanResult);

      // Assert — adapter prioritizes invoiceRecord (authoritative source for status)
      expect(mockValidator.validateRecord).toHaveBeenCalledWith(
        invoiceRecord,
        'create',
        InvoiceStatus.PENDING
      );
      expect(mockValidator.validateRecord).toHaveBeenCalledTimes(1);
      expect(result.shouldStop).toBe(true);
    });

    it('当没有 paymentRecord 时，应该使用 invoiceRecord 进行验证', () => {
      // Arrange
      const invoiceRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '0u8' as any,
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      const scanResult: InvoiceScanResult = {
        invoiceRecord,
        paymentRecord: null
      };

      (mockValidator.validateRecord as any).mockReturnValue({
        shouldConfirm: true,
        reason: 'Invoice found'
      });

      const adapter = createInvoiceValidationAdapter(mockValidator, mockInvoice);

      // Act
      const result = adapter(scanResult);

      // Assert
      expect(mockValidator.validateRecord).toHaveBeenCalledWith(
        invoiceRecord,
        'create',
        InvoiceStatus.PENDING
      );
      expect(result.shouldStop).toBe(true);
    });

    it('应该正确传递 invoice 的 action 和 status', () => {
      // Arrange
      const invoiceWithCancel: Invoice = {
        ...mockInvoice,
        metadata: {
          ...mockInvoice.metadata!,
          action: 'cancel'
        }
      };

      const invoiceRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '2u8' as any, // CANCELLED
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      const scanResult: InvoiceScanResult = {
        invoiceRecord,
        paymentRecord: null
      };

      (mockValidator.validateRecord as any).mockReturnValue({
        shouldConfirm: true,
        reason: 'Cancellation confirmed'
      });

      const adapter = createInvoiceValidationAdapter(mockValidator, invoiceWithCancel);

      // Act
      adapter(scanResult);

      // Assert
      expect(mockValidator.validateRecord).toHaveBeenCalledWith(
        invoiceRecord,
        'cancel',
        InvoiceStatus.PENDING
      );
    });

    it('当验证结果 shouldConfirm 为 true 时，应该返回 shouldStop: true', () => {
      // Arrange
      const invoiceRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '0u8' as any,
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      const scanResult: InvoiceScanResult = {
        invoiceRecord,
        paymentRecord: null
      };

      (mockValidator.validateRecord as any).mockReturnValue({
        shouldConfirm: true,
        reason: 'Success'
      });

      const adapter = createInvoiceValidationAdapter(mockValidator, mockInvoice);

      // Act
      const result = adapter(scanResult);

      // Assert
      expect(result.shouldStop).toBe(true);
      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toBe('Success');
    });

    it('当验证结果 shouldConfirm 为 false 时，应该返回 shouldStop: false 和 shouldContinue: true', () => {
      // Arrange
      const invoiceRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '0u8' as any, // PENDING，但 action 是 cancel
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      const invoiceWithCancel: Invoice = {
        ...mockInvoice,
        metadata: {
          ...mockInvoice.metadata!,
          action: 'cancel'
        }
      };

      const scanResult: InvoiceScanResult = {
        invoiceRecord,
        paymentRecord: null
      };

      (mockValidator.validateRecord as any).mockReturnValue({
        shouldConfirm: false,
        reason: 'Waiting for cancellation'
      });

      const adapter = createInvoiceValidationAdapter(mockValidator, invoiceWithCancel);

      // Act
      const result = adapter(scanResult);

      // Assert
      expect(result.shouldStop).toBe(false);
      expect(result.shouldContinue).toBe(true);
      expect(result.reason).toBe('Waiting for cancellation');
    });

    it('应该处理没有 metadata.action 的情况', () => {
      // Arrange
      const invoiceWithoutAction: Invoice = {
        ...mockInvoice,
        metadata: {
          confirmationStatus: 'SENDING',
          lastUpdated: new Date(),
          dataSource: 'local'
          // 没有 action
        }
      };

      const invoiceRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '0u8' as any,
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      const scanResult: InvoiceScanResult = {
        invoiceRecord,
        paymentRecord: null
      };

      (mockValidator.validateRecord as any).mockReturnValue({
        shouldConfirm: true,
        reason: 'Default validation'
      });

      const adapter = createInvoiceValidationAdapter(mockValidator, invoiceWithoutAction);

      // Act
      adapter(scanResult);

      // Assert
      expect(mockValidator.validateRecord).toHaveBeenCalledWith(
        invoiceRecord,
        undefined,
        InvoiceStatus.PENDING
      );
    });

    it('应该处理不同的 invoice status', () => {
      // Arrange
      const paidInvoice: Invoice = {
        ...mockInvoice,
        status: InvoiceStatus.PAID
      };

      const invoiceRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '1u8' as any,
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      const scanResult: InvoiceScanResult = {
        invoiceRecord,
        paymentRecord: null
      };

      (mockValidator.validateRecord as any).mockReturnValue({
        shouldConfirm: true,
        reason: 'Status matched'
      });

      const adapter = createInvoiceValidationAdapter(mockValidator, paidInvoice);

      // Act
      adapter(scanResult);

      // Assert
      expect(mockValidator.validateRecord).toHaveBeenCalledWith(
        invoiceRecord,
        'create',
        InvoiceStatus.PAID
      );
    });
  });
});

