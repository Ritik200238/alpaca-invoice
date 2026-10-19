import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InvoiceStatusValidator } from '../InvoiceStatusValidatorImpl';
import { AleoInvoiceRecord, AleoPaymentRecord } from '@/services/CryptoService/ICryptoService';
import { InvoiceStatus } from '@/lib/types';

// Mock cleanAleoNumber
vi.mock('@/lib/utils', () => ({
  cleanAleoNumber: (value: string | number) => {
    if (typeof value === 'string') {
      // 移除 'u8' 后缀
      return value.replace(/u8$/, '');
    }
    return String(value);
  }
}));

describe('InvoiceStatusValidator', () => {
  let validator: InvoiceStatusValidator;

  beforeEach(() => {
    validator = new InvoiceStatusValidator();
  });

  describe('validateRecord - null 记录', () => {
    it('应该对 null 记录返回 shouldConfirm: false', () => {
      // Act
      const result = validator.validateRecord(null, undefined, InvoiceStatus.PENDING);

      // Assert
      expect(result.shouldConfirm).toBe(false);
      expect(result.reason).toBe('No record found');
    });
  });

  describe('validateRecord - PaymentRecord', () => {
    it('应该对 PaymentRecord 总是返回 shouldConfirm: true', () => {
      // Arrange
      const paymentRecord: AleoPaymentRecord = {
        owner: 'aleo1test',
        payment_id: 'payment123field',
        invoice_id: 'invoice123field',
        amount: '1000000',
        payer: 'aleo1payer',
        payee: 'aleo1payee',
        paid_at: 1234567890
      };

      // Act
      const result = validator.validateRecord(paymentRecord, 'create', InvoiceStatus.PENDING);

      // Assert
      expect(result.shouldConfirm).toBe(true);
      expect(result.reason).toBe('PaymentRecord found (indicates paid)');
    });

    it('应该对 PaymentRecord 忽略 action 类型', () => {
      // Arrange
      const paymentRecord: AleoPaymentRecord = {
        owner: 'aleo1test',
        payment_id: 'payment123field',
        invoice_id: 'invoice123field',
        amount: '1000000',
        payer: 'aleo1payer',
        payee: 'aleo1payee',
        paid_at: 1234567890
      };

      // Act
      const result1 = validator.validateRecord(paymentRecord, 'cancel', InvoiceStatus.PENDING);
      const result2 = validator.validateRecord(paymentRecord, 'pay', InvoiceStatus.PENDING);
      const result3 = validator.validateRecord(paymentRecord, 'create', InvoiceStatus.PENDING);

      // Assert
      expect(result1.shouldConfirm).toBe(true);
      expect(result2.shouldConfirm).toBe(true);
      expect(result3.shouldConfirm).toBe(true);
    });
  });

  describe('validateRecord - InvoiceRecord with cancel action', () => {
    it('当 status 为 CANCELLED 时应该返回 shouldConfirm: true', () => {
      // Arrange
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

      // Act
      const result = validator.validateRecord(invoiceRecord, 'cancel', InvoiceStatus.PENDING);

      // Assert
      expect(result.shouldConfirm).toBe(true);
      expect(result.reason).toBe('Cancellation confirmed');
      expect(result.currentStatus).toBe(InvoiceStatus.CANCELLED);
      expect(result.expectedStatus).toBe(InvoiceStatus.CANCELLED);
    });

    it('当 status 不是 CANCELLED 时应该返回 shouldConfirm: false', () => {
      // Arrange
      const invoiceRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '0u8' as any, // PENDING
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      // Act
      const result = validator.validateRecord(invoiceRecord, 'cancel', InvoiceStatus.PENDING);

      // Assert
      expect(result.shouldConfirm).toBe(false);
      expect(result.reason).toBe('Waiting for status to change to CANCELLED');
      expect(result.currentStatus).toBe(InvoiceStatus.PENDING);
      expect(result.expectedStatus).toBe(InvoiceStatus.CANCELLED);
    });

    it('应该处理不同的非 CANCELLED 状态', () => {
      // Arrange
      const paidRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '1u8' as any, // PAID
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      // Act
      const result = validator.validateRecord(paidRecord, 'cancel', InvoiceStatus.PENDING);

      // Assert
      expect(result.shouldConfirm).toBe(false);
      expect(result.currentStatus).toBe(InvoiceStatus.PAID);
      expect(result.expectedStatus).toBe(InvoiceStatus.CANCELLED);
    });
  });

  describe('validateRecord - InvoiceRecord with pay action', () => {
    it('当 status 为 PAID 时应该返回 shouldConfirm: true', () => {
      // Arrange
      const invoiceRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '1u8' as any, // PAID
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      // Act
      const result = validator.validateRecord(invoiceRecord, 'pay', InvoiceStatus.PENDING);

      // Assert
      expect(result.shouldConfirm).toBe(true);
      expect(result.reason).toBe('Payment confirmed');
      expect(result.currentStatus).toBe(InvoiceStatus.PAID);
      expect(result.expectedStatus).toBe(InvoiceStatus.PAID);
    });

    it('当 status 不是 PAID 时应该返回 shouldConfirm: false', () => {
      // Arrange
      const invoiceRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '0u8' as any, // PENDING
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      // Act
      const result = validator.validateRecord(invoiceRecord, 'pay', InvoiceStatus.PENDING);

      // Assert
      expect(result.shouldConfirm).toBe(false);
      expect(result.reason).toBe('Waiting for status to change to PAID');
      expect(result.currentStatus).toBe(InvoiceStatus.PENDING);
      expect(result.expectedStatus).toBe(InvoiceStatus.PAID);
    });
  });

  describe('validateRecord - InvoiceRecord with create action', () => {
    it('应该对 create action 总是返回 shouldConfirm: true', () => {
      // Arrange
      const invoiceRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '0u8' as any, // PENDING
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      // Act
      const result = validator.validateRecord(invoiceRecord, 'create', InvoiceStatus.PENDING);

      // Assert
      expect(result.shouldConfirm).toBe(true);
      expect(result.reason).toBe('Invoice created and found on chain');
      expect(result.currentStatus).toBe(InvoiceStatus.PENDING);
    });

    it('应该对 create action 忽略 status 值', () => {
      // Arrange
      const cancelledRecord: AleoInvoiceRecord = {
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

      // Act
      const result = validator.validateRecord(cancelledRecord, 'create', InvoiceStatus.PENDING);

      // Assert
      expect(result.shouldConfirm).toBe(true);
      expect(result.reason).toBe('Invoice created and found on chain');
    });
  });

  describe('validateRecord - InvoiceRecord without action', () => {
    it('当 originalStatus 和 recordStatus 都是 PENDING 时应该返回 shouldConfirm: true', () => {
      // Arrange
      const invoiceRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '0u8' as any, // PENDING
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      // Act
      const result = validator.validateRecord(invoiceRecord, undefined, InvoiceStatus.PENDING);

      // Assert
      expect(result.shouldConfirm).toBe(true);
      expect(result.reason).toBe('Invoice found on chain with matching status');
      expect(result.currentStatus).toBe(InvoiceStatus.PENDING);
    });

    it('当 status 已变化时应该返回 shouldConfirm: true', () => {
      // Arrange
      const paidRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '1u8' as any, // PAID
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      // Act
      const result = validator.validateRecord(paidRecord, undefined, InvoiceStatus.PENDING);

      // Assert
      expect(result.shouldConfirm).toBe(true);
      expect(result.reason).toBe('Status changed, confirming');
      expect(result.currentStatus).toBe(InvoiceStatus.PAID);
    });

    it('当 originalStatus 不是 PENDING 时应该返回 shouldConfirm: true', () => {
      // Arrange
      const invoiceRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '0u8' as any, // PENDING
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      // Act
      const result = validator.validateRecord(invoiceRecord, undefined, InvoiceStatus.PAID);

      // Assert
      expect(result.shouldConfirm).toBe(true);
      expect(result.reason).toBe('Status changed, confirming');
    });
  });

  describe('边界情况', () => {
    it('应该处理 EXPIRED 状态', () => {
      // Arrange
      const expiredRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: '3u8' as any, // EXPIRED
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      // Act
      const result = validator.validateRecord(expiredRecord, 'cancel', InvoiceStatus.PENDING);

      // Assert
      expect(result.shouldConfirm).toBe(false);
      expect(result.currentStatus).toBe(InvoiceStatus.EXPIRED);
    });

    it('应该处理数字格式的 status', () => {
      // Arrange
      const invoiceRecord: AleoInvoiceRecord = {
        owner: 'aleo1test',
        invoice_id: 'invoice123field',
        invoice_hash: 'hash123field',
        amount: '1000000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: 2 as any, // 数字格式的 CANCELLED
        created_at: 1234567800,
        tax_amount: '0',
        order_id: '0field',
        currency: '0field',
        items_hash: '0field',
        memo_hash: '0field'
      };

      // Act
      const result = validator.validateRecord(invoiceRecord, 'cancel', InvoiceStatus.PENDING);

      // Assert
      expect(result.shouldConfirm).toBe(true);
      expect(result.currentStatus).toBe(InvoiceStatus.CANCELLED);
    });
  });

  describe('集成测试', () => {
    it('应该完成从创建到取消的完整验证流程', () => {
      // Arrange - 创建发票
      const createdRecord: AleoInvoiceRecord = {
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

      // Act - 验证创建
      const createResult = validator.validateRecord(createdRecord, 'create', InvoiceStatus.PENDING);

      // Assert
      expect(createResult.shouldConfirm).toBe(true);

      // Arrange - 取消发票
      const cancelledRecord: AleoInvoiceRecord = {
        ...createdRecord,
        status: '2u8' as any
      };

      // Act - 验证取消
      const cancelResult = validator.validateRecord(cancelledRecord, 'cancel', InvoiceStatus.PENDING);

      // Assert
      expect(cancelResult.shouldConfirm).toBe(true);
      expect(cancelResult.currentStatus).toBe(InvoiceStatus.CANCELLED);
    });

    it('应该完成从创建到支付的完整验证流程', () => {
      // Arrange - 创建发票
      const createdRecord: AleoInvoiceRecord = {
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

      // Act - 验证创建
      const createResult = validator.validateRecord(createdRecord, 'create', InvoiceStatus.PENDING);

      // Assert
      expect(createResult.shouldConfirm).toBe(true);

      // Arrange - 支付发票（使用 PaymentRecord）
      const paymentRecord: AleoPaymentRecord = {
        owner: 'aleo1test',
        payment_id: 'payment123field',
        invoice_id: 'invoice123field',
        amount: '1000000',
        payer: 'aleo1buyer',
        payee: 'aleo1seller',
        paid_at: 1234567890
      };

      // Act - 验证支付
      const payResult = validator.validateRecord(paymentRecord, 'pay', InvoiceStatus.PENDING);

      // Assert
      expect(payResult.shouldConfirm).toBe(true);
      expect(payResult.reason).toBe('PaymentRecord found (indicates paid)');
    });
  });
});

