import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoService, CryptoServiceError } from '../CryptoServiceImpl';
import { CryptoError, AleoInvoiceRecord } from '../ICryptoService';
import type {
  InvoiceDetails,
  EncryptedPayload,
  AleoField,
  AleoAddress,
  InvoiceChainComputed,
  InvoiceHashChainContext,
  ContractInvoiceHashParams
} from '@/lib/types';

/** Build contract 10-params from details + chain context (for tests). */
function toContractParams(
  details: InvoiceDetails,
  ctx: InvoiceHashChainContext
): ContractInvoiceHashParams {
  return {
    seller: ctx.seller,
    buyer: ctx.buyer,
    amount: BigInt(details.subtotal),
    taxAmount: BigInt(details.taxAmount),
    dueDate: ctx.dueDate,
    nonce: ctx.nonce,
    orderId: ctx.orderIdField,
    currency: ctx.currencyField,
    itemsHash: ctx.itemsHash,
    memoHash: ctx.memoHash
  };
}

describe('CryptoService', () => {
  let service: CryptoService;

  // ========== Form inputs (native UI/System values for create_invoice) ==========
  const mockDetails: InvoiceDetails = {
    invoiceNumber: 'INV-2026-001',
    orderId: 'ORD-2026-001',
    lineItems: [{ description: 'Item 1', quantity: 1, unitPrice: 1000, amount: 1000 }],
    subtotal: 1000,
    taxRate: 0.13,
    taxAmount: 130,
    total: 1130,
    currency: 'USD',
    notes: 'Wave 2 Test'
  };

  const mockSeller = 'aleo1sellerseller1234567890abcdefghijk' as AleoAddress;
  const mockBuyer = 'aleo1buyerbuyer1234567890abcdefghijk' as AleoAddress;
  const mockDueDate = Math.floor(Date.now() / 1000) + 86400;

  // ========== Computed values for chain (InvoiceChainComputed) ==========
  let mockChainComputed: InvoiceChainComputed;

  beforeEach(async () => {
    service = new CryptoService();
    const nonce = await service.hashObjectToField('TEST-NONCE-FIXED');
    const itemsHash = await service.hashObjectToField(mockDetails.lineItems);
    const memoHash = await service.hashObjectToField(mockDetails.notes ?? '');
    const orderIdField = await service.hashObjectToField(mockDetails.orderId ?? mockDetails.invoiceNumber);
    const currencyField = await service.hashObjectToField(mockDetails.currency);
    const chainContext: InvoiceHashChainContext = {
      seller: mockSeller,
      buyer: mockBuyer,
      dueDate: mockDueDate,
      nonce,
      orderIdField,
      currencyField,
      itemsHash,
      memoHash
    };
    const paramsForCreation = toContractParams(mockDetails, chainContext);
    const invoiceHash = await service.computeInvoiceHash(paramsForCreation);
    mockChainComputed = {
      ...chainContext,
      invoiceHash,
      lineItemsSum: service.sumLineItems(mockDetails.lineItems),
      expectedTotal: service.calculateTotal(
        BigInt(mockDetails.subtotal),
        BigInt(mockDetails.taxAmount)
      ),
      taxRateBps: service.calculateTaxBps(mockDetails.taxRate)
    };
  });

  describe('computeInvoiceHash', () => {
    it('should generate the same hash for identical invoice details', async () => {
      // Arrange
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [
          { description: 'Item 1', quantity: 2, unitPrice: 100, amount: 200 }
        ],
        subtotal: 200,
        taxRate: 0.1,
        taxAmount: 20,
        total: 220,
        currency: 'USD',
        notes: 'Test invoice'
      };

      // Act
      const hash1 = await service.computeInvoiceHash(details);
      const hash2 = await service.computeInvoiceHash(details);

      // Assert
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^\d+field$/);
    });

    it('should generate different hashes for different invoice details', async () => {
      // Arrange
      const details1: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [
          { description: 'Item 1', quantity: 2, unitPrice: 100, amount: 200 }
        ],
        subtotal: 200,
        taxRate: 0.1,
        taxAmount: 20,
        total: 220,
        currency: 'USD'
      };

      const details2: InvoiceDetails = {
        invoiceNumber: 'INV-002',
        lineItems: [
          { description: 'Item 2', quantity: 1, unitPrice: 150, amount: 150 }
        ],
        subtotal: 150,
        taxRate: 0.1,
        taxAmount: 15,
        total: 165,
        currency: 'USD'
      };

      // Act
      const hash1 = await service.computeInvoiceHash(details1);
      const hash2 = await service.computeInvoiceHash(details2);

      // Assert
      expect(hash1).not.toBe(hash2);
    });

    it('should return the correct AleoField format', async () => {
      // Arrange
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [
          { description: 'Item 1', quantity: 1, unitPrice: 100, amount: 100 }
        ],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD'
      };

      // Act
      const hash = await service.computeInvoiceHash(details);

      // Assert
      expect(hash).toMatch(/^\d+field$/);
      expect(hash.endsWith('field')).toBe(true);

      // Extract the numeric part and verify it is a valid BigInt
      const numberPart = hash.slice(0, -5); // Remove 'field'
      expect(() => BigInt(numberPart)).not.toThrow();

      // Verify the value is within the Aleo Field range
      expect(service.validateFieldValue(hash)).toBe(true);
    });

    it('should be insensitive to field order (because sorted JSON is used)', async () => {
      // Arrange
      const details1: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [],
        subtotal: 100,
        taxRate: 0.1,
        taxAmount: 10,
        total: 110,
        currency: 'USD',
        notes: 'Note'
      };

      const details2: InvoiceDetails = {
        currency: 'USD',
        total: 110,
        taxAmount: 10,
        taxRate: 0.1,
        subtotal: 100,
        lineItems: [],
        notes: 'Note',
        invoiceNumber: 'INV-001'
      };

      // Act
      const hash1 = await service.computeInvoiceHash(details1);
      const hash2 = await service.computeInvoiceHash(details2);

      // Assert
      expect(hash1).toBe(hash2);
    });

    it('should handle invoices with multiple line items', async () => {
      // Arrange
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-003',
        lineItems: [
          { description: 'Item 1', quantity: 2, unitPrice: 100, amount: 200 },
          { description: 'Item 2', quantity: 3, unitPrice: 50, amount: 150 },
          { description: 'Item 3', quantity: 1, unitPrice: 75, amount: 75 }
        ],
        subtotal: 425,
        taxRate: 0.08,
        taxAmount: 34,
        total: 459,
        currency: 'EUR'
      };

      // Act
      const hash = await service.computeInvoiceHash(details);

      // Assert
      expect(hash).toMatch(/^\d+field$/);
      expect(hash).toBeTruthy();
      expect(service.validateFieldValue(hash)).toBe(true);
    });

    it('should handle optional fields (notes)', async () => {
      // Arrange
      const detailsWithNotes: InvoiceDetails = {
        invoiceNumber: 'INV-004',
        lineItems: [],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD',
        notes: 'Some notes'
      };

      const detailsWithoutNotes: InvoiceDetails = {
        invoiceNumber: 'INV-004',
        lineItems: [],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD'
      };

      // Act
      const hash1 = await service.computeInvoiceHash(detailsWithNotes);
      const hash2 = await service.computeInvoiceHash(detailsWithoutNotes);

      // Assert
      expect(hash1).not.toBe(hash2);
    });

    it('should be insensitive to field order in legacy mode (sorted JSON)', async () => {
      // Legacy mode (no context): sorted JSON produces same hash for same content
      const details1: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [],
        subtotal: 100,
        taxRate: 0.1,
        taxAmount: 10,
        total: 110,
        currency: 'USD',
        notes: 'Note'
      };
      const details2: InvoiceDetails = {
        currency: 'USD',
        total: 110,
        taxAmount: 10,
        taxRate: 0.1,
        subtotal: 100,
        lineItems: [],
        notes: 'Note',
        invoiceNumber: 'INV-001'
      };
      const hash1 = await service.computeInvoiceHash(details1);
      const hash2 = await service.computeInvoiceHash(details2);
      expect(hash1).toBe(hash2);
    });
  });

  describe('computeInvoiceHash (Wave 2 Protocol)', () => {
    it('should generate hash based on specific fields matching Leo struct', async () => {
      const hash = await service.computeInvoiceHash(toContractParams(mockDetails, mockChainComputed));
      expect(hash).toMatch(/^\d+field$/);
      const hash2 = await service.computeInvoiceHash(toContractParams(mockDetails, mockChainComputed));
      expect(hash).toBe(hash2);
    });

    it('should detect changes in critical financial fields', async () => {
      const hashOriginal = await service.computeInvoiceHash(toContractParams(mockDetails, mockChainComputed));
      const tamperedDetails = { ...mockDetails, taxAmount: 131 };
      const hashTampered = await service.computeInvoiceHash(toContractParams(tamperedDetails, mockChainComputed));
      expect(hashOriginal).not.toBe(hashTampered);
    });

    it('should include orderId and currency in hash computation', async () => {
      const hash1 = await service.computeInvoiceHash(toContractParams(mockDetails, mockChainComputed));
      const hash2 = await service.computeInvoiceHash(toContractParams(mockDetails, {
        ...mockChainComputed,
        orderIdField: '999999field' as AleoField
      }));
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hashObjectToField', () => {
    it('should return valid AleoField format for string input', async () => {
      const result = await service.hashObjectToField('test-string');
      expect(result).toMatch(/^\d+field$/);
      expect(service.validateFieldValue(result)).toBe(true);
    });

    it('should return valid AleoField format for object input', async () => {
      const result = await service.hashObjectToField({ a: 1, b: 'two' });
      expect(result).toMatch(/^\d+field$/);
      expect(service.validateFieldValue(result)).toBe(true);
    });

    it('should return valid AleoField format for array input', async () => {
      const lineItems = [{ description: 'Item 1', quantity: 1, unitPrice: 100, amount: 100 }];
      const result = await service.hashObjectToField(lineItems);
      expect(result).toMatch(/^\d+field$/);
      expect(service.validateFieldValue(result)).toBe(true);
    });

    it('should be deterministic: same input produces same hash', async () => {
      const input = 'deterministic-test';
      const h1 = await service.hashObjectToField(input);
      const h2 = await service.hashObjectToField(input);
      expect(h1).toBe(h2);
    });

    it('should produce different hashes for different inputs', async () => {
      const h1 = await service.hashObjectToField('input-a');
      const h2 = await service.hashObjectToField('input-b');
      const h3 = await service.hashObjectToField({ x: 1 });
      expect(h1).not.toBe(h2);
      expect(h1).not.toBe(h3);
      expect(h2).not.toBe(h3);
    });

    it('should compute itemsHash from lineItems (as in create_invoice flow)', async () => {
      const itemsHash = await service.hashObjectToField(mockDetails.lineItems);
      expect(itemsHash).toMatch(/^\d+field$/);
      expect(service.validateFieldValue(itemsHash)).toBe(true);
    });

    it('should compute memoHash from notes (as in create_invoice flow)', async () => {
      const memoHash = await service.hashObjectToField(mockDetails.notes ?? '');
      expect(memoHash).toMatch(/^\d+field$/);
      expect(service.validateFieldValue(memoHash)).toBe(true);
    });

    it('should compute orderId from orderId/invoiceNumber (as in create_invoice flow)', async () => {
      const orderIdField = await service.hashObjectToField(
        mockDetails.orderId ?? mockDetails.invoiceNumber
      );
      expect(orderIdField).toMatch(/^\d+field$/);
      expect(service.validateFieldValue(orderIdField)).toBe(true);
    });

    it('should handle empty string input', async () => {
      const result = await service.hashObjectToField('');
      expect(result).toMatch(/^\d+field$/);
      expect(service.validateFieldValue(result)).toBe(true);
    });

    it('should handle empty array input', async () => {
      const result = await service.hashObjectToField([]);
      expect(result).toMatch(/^\d+field$/);
      expect(service.validateFieldValue(result)).toBe(true);
    });

    it('should produce different hash when lineItems content changes', async () => {
      const items1 = [{ description: 'A', quantity: 1, amount: 100 }];
      const items2 = [{ description: 'B', quantity: 1, amount: 100 }];
      const h1 = await service.hashObjectToField(items1);
      const h2 = await service.hashObjectToField(items2);
      expect(h1).not.toBe(h2);
    });
  });

  describe('sumLineItems', () => {
    it('should sum line item amounts', () => {
      const items = [
        { description: 'A', quantity: 1, unitPrice: 100, amount: 100 },
        { description: 'B', quantity: 2, unitPrice: 50, amount: 100 }
      ];
      expect(service.sumLineItems(items)).toBe(200n);
    });
    it('should use amount when present', () => {
      const items = [
        { description: 'A', quantity: 1, unitPrice: 99, amount: 100 }
      ];
      expect(service.sumLineItems(items)).toBe(100n);
    });
    it('should fall back to quantity * unitPrice when amount missing', () => {
      const items = [
        { description: 'A', quantity: 3, unitPrice: 33, amount: undefined as any }
      ];
      expect(service.sumLineItems(items)).toBe(99n);
    });
  });

  describe('calculateTotal', () => {
    it('should return amount + taxAmount', () => {
      expect(service.calculateTotal(1000n, 130n)).toBe(1130n);
    });
  });

  describe('calculateTaxBps', () => {
    it('should convert 13% to 1300', () => {
      expect(service.calculateTaxBps(0.13)).toBe(1300n);
    });
    it('should convert 0% to 0', () => {
      expect(service.calculateTaxBps(0)).toBe(0n);
    });
  });

  describe('dateToU32 and nowToU32', () => {
    it('should convert Date to Unix seconds', () => {
      const d = new Date('2000-01-01T00:00:00Z');
      expect(service.dateToU32(d)).toBe(946684800);
    });
    it('should return current time as integer seconds', () => {
      const t = service.nowToU32();
      expect(Number.isInteger(t)).toBe(true);
      expect(t).toBeGreaterThan(1700000000);
    });
  });

  describe('encryptPayload (AES-GCM Wave 2)', () => {
    it('should produce iv, ciphertext, and authTag (Wave 2 required)', async () => {
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [{ description: 'Item 1', quantity: 1, unitPrice: 100, amount: 100 }],
        subtotal: 100,
        taxRate: 0.1,
        taxAmount: 10,
        total: 110,
        currency: 'USD'
      };
      const masterKey = 'test-master-key-32-chars-long-!!!';

      const encrypted = await service.encryptPayload(details, masterKey);

      expect(encrypted.iv).toBeDefined();
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
      expect(typeof encrypted.authTag).toBe('string');
      expect(encrypted.authTag!.length).toBeGreaterThan(10);
    });

    it('should generate different iv, ciphertext, and authTag on each call (randomness)', async () => {
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD'
      };
      const masterKey = 'test-master-key-12345678901234567890';

      const encrypted1 = await service.encryptPayload(details, masterKey);
      const encrypted2 = await service.encryptPayload(details, masterKey);

      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.authTag).not.toBe(encrypted2.authTag);
    });

    it('should derive stable keys from short and long passwords (PBKDF2)', async () => {
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD'
      };
      const shortKey = 'short';
      const longKey = 'this-is-a-very-long-master-key-with-many-characters-that-exceeds-32-bytes';

      const encShort = await service.encryptPayload(details, shortKey);
      const encLong = await service.encryptPayload(details, longKey);

      expect(encShort.iv).toBeTruthy();
      expect(encShort.ciphertext).toBeTruthy();
      expect(encShort.authTag).toBeTruthy();
      expect(encLong.iv).toBeTruthy();
      expect(encLong.ciphertext).toBeTruthy();
      expect(encLong.authTag).toBeTruthy();
      const decShort = await service.decryptPayload(encShort, shortKey);
      const decLong = await service.decryptPayload(encLong, longKey);
      expect(decShort).toEqual(details);
      expect(decLong).toEqual(details);
    });

    it('should support selective disclosure (encrypt partial subset)', async () => {
      const subset = { total: 100, currency: 'USD' };
      const masterKey = 'test-master-key-1234567890123456';

      const encrypted = await service.encryptPayload(subset as InvoiceDetails, masterKey);
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.authTag).toBeTruthy();

      const decrypted = await service.decryptPayload(encrypted, masterKey);
      expect(decrypted).toEqual(subset);
      expect(decrypted).not.toHaveProperty('notes');
      expect(decrypted).not.toHaveProperty('lineItems');
    });

    it('should handle Aleo keywords and special chars in plaintext', async () => {
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-field-address',
        lineItems: [],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD',
        notes: 'Aleo keywords: field, address, u64'
      };
      const masterKey = 'test-master-key-1234567890123456';

      const encrypted = await service.encryptPayload(details, masterKey);
      const decrypted = await service.decryptPayload(encrypted, masterKey);
      expect(decrypted).toEqual(details);
      expect(decrypted.notes).toBe('Aleo keywords: field, address, u64');
    });
  });

  describe('decryptPayload (integrity protection)', () => {
    it('should successfully decrypt previously encrypted invoice details', async () => {
      const originalDetails: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [{ description: 'Item 1', quantity: 2, unitPrice: 50, amount: 100 }],
        subtotal: 100,
        taxRate: 0.15,
        taxAmount: 15,
        total: 115,
        currency: 'USD',
        notes: 'Test notes'
      };
      const masterKey = 'test-master-key-12345678901234567890';

      const encrypted = await service.encryptPayload(originalDetails, masterKey);
      const decrypted = await service.decryptPayload(encrypted, masterKey);

      expect(decrypted).toEqual(originalDetails);
    });

    it('should throw DECRYPTION_FAILED when ciphertext is tampered with', async () => {
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD'
      };
      const masterKey = 'test-master-key-1234567890123456';
      const encrypted = await service.encryptPayload(details, masterKey);

      const tamperedPayload: EncryptedPayload = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.slice(0, -4) + 'xxxx'
      };

      await expect(
        service.decryptPayload(tamperedPayload, masterKey)
      ).rejects.toThrow(CryptoServiceError);

      try {
        await service.decryptPayload(tamperedPayload, masterKey);
      } catch (error: any) {
        expect(error.code).toBe(CryptoError.DECRYPTION_FAILED);
        expect(error.message).not.toMatch(/correct-master-key|wrong-master-key/);
      }
    });

    it('should throw DECRYPTION_FAILED when authTag is tampered with', async () => {
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD'
      };
      const masterKey = 'test-master-key-1234567890123456';
      const encrypted = await service.encryptPayload(details, masterKey);

      expect(encrypted.authTag).toBeDefined();
      const tamperedPayload: EncryptedPayload = {
        ...encrypted,
        authTag: encrypted.authTag!.slice(0, -4) + 'xxxx'
      };

      await expect(
        service.decryptPayload(tamperedPayload, masterKey)
      ).rejects.toThrow(CryptoServiceError);

      try {
        await service.decryptPayload(tamperedPayload, masterKey);
      } catch (error: any) {
        expect(error.code).toBe(CryptoError.DECRYPTION_FAILED);
      }
    });

    it('should throw DECRYPTION_FAILED when using wrong key', async () => {
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD'
      };
      const correctKey = 'correct-master-key-1234567890123456';
      const wrongKey = 'wrong-master-key-0987654321098765432';

      const encrypted = await service.encryptPayload(details, correctKey);

      await expect(
        service.decryptPayload(encrypted, wrongKey)
      ).rejects.toThrow(CryptoServiceError);

      try {
        await service.decryptPayload(encrypted, wrongKey);
      } catch (error: any) {
        expect(error).toBeInstanceOf(CryptoServiceError);
        expect(error.code).toBe(CryptoError.DECRYPTION_FAILED);
        expect(error.message).not.toMatch(/correct-master-key|wrong-master-key/);
      }
    });

    it('should throw error for invalid Base64 payload (format error)', async () => {
      const invalidPayload: EncryptedPayload = {
        iv: 'invalid-base64!!!',
        ciphertext: 'also-invalid!!!'
      };
      const masterKey = 'test-key';

      await expect(
        service.decryptPayload(invalidPayload, masterKey)
      ).rejects.toThrow(CryptoServiceError);
    });

    it('should throw error when IV or ciphertext is empty', async () => {
      const validB64 = 'AAAAAAAAAAAAAAAAAAAAAA==';
      const emptyIvPayload: EncryptedPayload = {
        iv: '',
        ciphertext: validB64,
        authTag: validB64
      };
      const emptyCiphertextPayload: EncryptedPayload = {
        iv: 'AAAAAAAAAAAAAAAA',
        ciphertext: '',
        authTag: validB64
      };
      const masterKey = 'test-key';

      await expect(
        service.decryptPayload(emptyIvPayload, masterKey)
      ).rejects.toThrow(CryptoServiceError);

      await expect(
        service.decryptPayload(emptyCiphertextPayload, masterKey)
      ).rejects.toThrow(CryptoServiceError);
    });
  });

  describe('parseAleoRecord', () => {
    /**
     * parseAleoRecord is the recommended method for parsing on-chain Records
     *
     * Complete invoice verification flow:
     * 1. At invoice creation: computeInvoiceHash(details) -> invoice_hash is stored on-chain
     * 2. At viewing: parseAleoRecord(jsonString) -> extract on-chain invoice_hash
     * 3. At verification: verifyInvoiceIntegrity(localDetails, chainHash) -> confirm data integrity
     */

    it('should be able to parse a decrypted InvoiceRecord from wallet.requestRecords()', async () => {
      // Arrange - simulate decrypted data returned by wallet.requestRecords (Wave 2)
      const mockChainRecord: AleoInvoiceRecord = {
        owner: 'aleo1test123',
        invoice_id: '12345field',
        invoice_hash: '9876543210field',
        amount: '1000000',
        tax_amount: '130000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        status: 0,
        created_at: 1234567800,
        order_id: '888888field',
        currency: '999999field',
        items_hash: '789field',
        memo_hash: '012field'
      };
      const jsonString = JSON.stringify(mockChainRecord);

      // Act
      const result = await service.parseAleoRecord<AleoInvoiceRecord>(jsonString);

      // Assert
      expect(result).toEqual(mockChainRecord);
      expect(result.invoice_hash).toBe('9876543210field');
      expect(result.invoice_id).toBe('12345field');
      expect(result.owner).toBe('aleo1test123');
      expect(result.items_hash).toBe('789field');
      expect(result.memo_hash).toBe('012field');
    });

    it('should parse Wave 2 fields (items_hash, memo_hash, order_id, currency)', async () => {
      const mockChainRecord = {
        invoice_id: '123field',
        invoice_hash: '456field',
        items_hash: '789field',
        memo_hash: '012field',
        order_id: '888field',
        currency: '999field',
        status: 0,
        amount: '1000',
        seller: 'aleo1seller',
        buyer: 'aleo1buyer',
        due_date: 1234567890,
        created_at: 1234567800,
        owner: 'aleo1owner'
      };
      const result = await service.parseAleoRecord<AleoInvoiceRecord>(JSON.stringify(mockChainRecord));
      expect(result).toHaveProperty('items_hash', '789field');
      expect(result).toHaveProperty('memo_hash', '012field');
      expect(result).toHaveProperty('order_id', '888field');
      expect(result).toHaveProperty('currency', '999field');
    });

    it('should support generic type inference', async () => {
      // Arrange - test generic support
      interface CustomRecord {
        owner: string;
        custom_field: string;
      }
      const customRecord: CustomRecord = {
        owner: 'aleo1custom',
        custom_field: 'test-value'
      };
      const jsonString = JSON.stringify(customRecord);

      // Act
      const result = await service.parseAleoRecord<CustomRecord>(jsonString);

      // Assert
      expect(result).toEqual(customRecord);
      expect(result.custom_field).toBe('test-value');
    });

    it('should be able to parse decrypted Records in array format (batch return)', async () => {
      // Arrange (Wave 2 structure)
      const mockRecords: AleoInvoiceRecord[] = [
        {
          owner: 'aleo1test123',
          invoice_id: '11111field',
          invoice_hash: '111hash111field',
          amount: '1000000',
          tax_amount: '130000',
          seller: 'aleo1seller1',
          buyer: 'aleo1buyer1',
          due_date: 1234567890,
          status: 0,
          created_at: 1234567800,
          order_id: '888field',
          currency: '999field',
          items_hash: '111field',
          memo_hash: '222field'
        },
        {
          owner: 'aleo1test123',
          invoice_id: '22222field',
          invoice_hash: '222hash222field',
          amount: '2000000',
          tax_amount: '260000',
          seller: 'aleo1seller2',
          buyer: 'aleo1buyer2',
          due_date: 1234567900,
          status: 1,
          created_at: 1234567850,
          order_id: '999field',
          currency: '999field',
          items_hash: '333field',
          memo_hash: '444field'
        }
      ];
      const jsonString = JSON.stringify(mockRecords);

      // Act
      const result = await service.parseAleoRecord<AleoInvoiceRecord[]>(jsonString);

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].invoice_hash).toBe('111hash111field');
      expect(result[1].invoice_hash).toBe('222hash222field');
    });

    it('should suggest using wallet.requestRecords() for record1... encrypted format', async () => {
      // Arrange - simulate directly passing an encrypted Record (incorrect usage)
      const encryptedRecord = 'record1qvqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

      // Act & Assert
      await expect(
        service.parseAleoRecord(encryptedRecord)
      ).rejects.toThrow(CryptoServiceError);

      try {
        await service.parseAleoRecord(encryptedRecord);
      } catch (error: any) {
        expect(error).toBeInstanceOf(CryptoServiceError);
        expect(error.code).toBe(CryptoError.DECRYPTION_FAILED);
        expect(error.message).toContain('Encrypted record format detected');
        expect(error.message).toContain('wallet.requestRecords()');
        expect(error.details?.hint).toContain('automatically decrypts');
      }
    });

    it('should throw an error for an empty string', async () => {
      // Arrange
      const emptyString = '';

      // Act & Assert
      await expect(
        service.parseAleoRecord(emptyString)
      ).rejects.toThrow(CryptoServiceError);

      try {
        await service.parseAleoRecord(emptyString);
      } catch (error: any) {
        expect(error).toBeInstanceOf(CryptoServiceError);
        expect(error.code).toBe(CryptoError.DECRYPTION_FAILED);
        expect(error.message).toContain('Empty input string');
      }
    });

    it('should throw an error for invalid JSON format', async () => {
      // Arrange
      const invalidJson = '{ invalid json }';

      // Act & Assert
      await expect(
        service.parseAleoRecord(invalidJson)
      ).rejects.toThrow(CryptoServiceError);

      try {
        await service.parseAleoRecord(invalidJson);
      } catch (error: any) {
        expect(error).toBeInstanceOf(CryptoServiceError);
        expect(error.code).toBe(CryptoError.DECRYPTION_FAILED);
        expect(error.message).toContain('Failed to parse Aleo Record JSON');
      }
    });

    it('should throw a clear error message for unknown formats', async () => {
      // Arrange
      const unknownFormat = 'unknown-format-data-12345';

      // Act & Assert
      await expect(
        service.parseAleoRecord(unknownFormat)
      ).rejects.toThrow(CryptoServiceError);

      try {
        await service.parseAleoRecord(unknownFormat);
      } catch (error: any) {
        expect(error).toBeInstanceOf(CryptoServiceError);
        expect(error.code).toBe(CryptoError.DECRYPTION_FAILED);
        expect(error.message).toContain('Unknown input format');
        expect(error.message).toContain('wallet.requestRecords()');
      }
    });
  });

  describe('verifyInvoiceIntegrity (tamper-proof verification)', () => {
    /**
     * This is the core security feature of the invoice system:
     * - The invoice_hash is stored on-chain (immutable)
     * - Encrypted invoice details are stored locally
     * - At viewing time, data integrity is verified by recomputing the hash
     */

    it('should verify untampered invoice data as valid (legacy mode)', async () => {
      const invoiceDetails: InvoiceDetails = {
        invoiceNumber: 'INV-VERIFY-001',
        lineItems: [{ description: 'Item A', quantity: 2, unitPrice: 50, amount: 100 }],
        subtotal: 100,
        taxRate: 0.1,
        taxAmount: 10,
        total: 110,
        currency: 'USD',
        notes: 'Test verification'
      };
      const computedHash = await service.computeInvoiceHash(invoiceDetails);
      const isValid = await service.verifyInvoiceIntegrity(invoiceDetails, computedHash);
      expect(isValid).toBe(true);
    });

    it('should verify untampered invoice data as valid (Wave 2 with context)', async () => {
      const chainHash = await service.computeInvoiceHash(toContractParams(mockDetails, mockChainComputed));
      const isValid = await service.verifyInvoiceIntegrity(mockDetails, chainHash, mockChainComputed);
      expect(isValid).toBe(true);
    });

    it('should detect tampered invoice data', async () => {
      const originalDetails: InvoiceDetails = {
        invoiceNumber: 'INV-VERIFY-002',
        lineItems: [{ description: 'Item A', quantity: 1, unitPrice: 100, amount: 100 }],
        subtotal: 100,
        taxRate: 0.1,
        taxAmount: 10,
        total: 110,
        currency: 'USD'
      };
      const chainInvoiceHash = await service.computeInvoiceHash(originalDetails);
      const tamperedDetails: InvoiceDetails = {
        ...originalDetails,
        lineItems: [{ description: 'Item A', quantity: 1, unitPrice: 50, amount: 50 }],
        subtotal: 50,
        total: 55
      };
      const isValid = await service.verifyInvoiceIntegrity(tamperedDetails, chainInvoiceHash);
      expect(isValid).toBe(false);
    });

    it('should detect tampered invoice data (Wave 2 with context)', async () => {
      const chainHash = await service.computeInvoiceHash(toContractParams(mockDetails, mockChainComputed));
      const tamperedDetails = { ...mockDetails, taxAmount: 131 };
      const isValid = await service.verifyInvoiceIntegrity(
        tamperedDetails,
        chainHash,
        mockChainComputed
      );
      expect(isValid).toBe(false);
    });

    it('should detect partial field tampering', async () => {
      // Arrange
      const originalDetails: InvoiceDetails = {
        invoiceNumber: 'INV-VERIFY-003',
        lineItems: [
          { description: 'Laptop', quantity: 1, unitPrice: 1000, amount: 1000 }
        ],
        subtotal: 1000,
        taxRate: 0.1,
        taxAmount: 100,
        total: 1100,
        currency: 'USD',
        notes: 'Original note'
      };

      const chainInvoiceHash = await service.computeInvoiceHash(originalDetails);

      // Act - tamper with only the notes field
      const tamperedDetails: InvoiceDetails = {
        ...originalDetails,
        notes: 'Tampered note - amount modified'
      };

      const isValid = await service.verifyInvoiceIntegrity(tamperedDetails, chainInvoiceHash);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should be insensitive to field order in legacy mode (JSON normalization)', async () => {
      const details1: InvoiceDetails = {
        invoiceNumber: 'INV-ORDER-001',
        lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, amount: 100 }],
        subtotal: 100,
        taxRate: 0.1,
        taxAmount: 10,
        total: 110,
        currency: 'USD'
      };
      const hash1 = await service.computeInvoiceHash(details1);
      const details2: InvoiceDetails = {
        currency: 'USD',
        total: 110,
        taxAmount: 10,
        taxRate: 0.1,
        subtotal: 100,
        lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, amount: 100 }],
        invoiceNumber: 'INV-ORDER-001'
      };
      const isValid = await service.verifyInvoiceIntegrity(details2, hash1);
      expect(isValid).toBe(true);
    });

    it('should handle errors during verification', async () => {
      // Arrange
      const invalidDetails = null as any;
      const chainHash = '12345field' as AleoField;

      // Act & Assert
      await expect(
        service.verifyInvoiceIntegrity(invalidDetails, chainHash)
      ).rejects.toThrow(CryptoServiceError);
    });
  });

  describe('Complete invoice verification flow (integration test)', () => {
    /**
     * This test simulates the real invoice lifecycle:
     * 1. Create invoice -> compute hash -> store on-chain
     * 2. Encrypt details locally -> IndexedDB
     * 3. View -> parse on-chain Record -> get invoice_hash
     * 4. Decrypt local details -> verify integrity
     */

    it('should complete the full flow from invoice creation to verification (Wave 2)', async () => {
      // ===== Phase 1: Invoice Creation (Wave 2 with context) =====
      const invoiceDetails: InvoiceDetails = {
        invoiceNumber: 'INV-FULL-FLOW-001',
        lineItems: [
          { description: 'Product A', quantity: 5, unitPrice: 200, amount: 1000 },
          { description: 'Product B', quantity: 2, unitPrice: 150, amount: 300 }
        ],
        subtotal: 1300,
        taxRate: 0.13,
        taxAmount: 169,
        total: 1469,
        currency: 'CAD',
        notes: 'Complete flow test'
      };
      const flowDueDate = Math.floor(Date.now() / 1000) + 86400;
      const flowNonce = await service.hashObjectToField('FLOW-NONCE');
      const flowItemsHash = await service.hashObjectToField(invoiceDetails.lineItems);
      const flowMemoHash = await service.hashObjectToField(invoiceDetails.notes ?? '');
      const flowOrderIdField = await service.hashObjectToField(invoiceDetails.invoiceNumber);
      const flowCurrencyField = await service.hashObjectToField(invoiceDetails.currency);
      const flowHashInput = {
        seller: mockSeller,
        buyer: mockBuyer,
        dueDate: flowDueDate,
        nonce: flowNonce,
        orderIdField: flowOrderIdField,
        currencyField: flowCurrencyField,
        itemsHash: flowItemsHash,
        memoHash: flowMemoHash
      };
      const invoiceHash = await service.computeInvoiceHash(toContractParams(invoiceDetails, flowHashInput));
      expect(invoiceHash).toMatch(/^\d+field$/);

      // ===== Phase 2: Local Encrypted Storage =====
      const masterKey = 'user-master-key-for-encryption';
      const encryptedPayload = await service.encryptPayload(invoiceDetails, masterKey);
      expect(encryptedPayload.iv).toBeTruthy();
      expect(encryptedPayload.ciphertext).toBeTruthy();

      // ===== Phase 3: Simulate on-chain Record (Wave 2) =====
      const mockChainRecord: AleoInvoiceRecord = {
        owner: 'aleo1qwerty123',
        invoice_id: '98765field',
        invoice_hash: invoiceHash,
        amount: '1469000000',
        tax_amount: '169000000',
        seller: flowHashInput.seller,
        buyer: flowHashInput.buyer,
        due_date: flowHashInput.dueDate,
        status: 0,
        created_at: Math.floor(Date.now() / 1000),
        order_id: flowHashInput.orderIdField,
        currency: flowHashInput.currencyField,
        items_hash: flowHashInput.itemsHash,
        memo_hash: flowHashInput.memoHash
      };
      const parsedRecord = await service.parseAleoRecord<AleoInvoiceRecord>(
        JSON.stringify(mockChainRecord)
      );
      expect(parsedRecord.invoice_hash).toBe(invoiceHash);

      // ===== Phase 4: Decrypt and verify with context =====
      const decryptedDetails = await service.decryptPayload(encryptedPayload, masterKey);
      const isValid = await service.verifyInvoiceIntegrity(
        decryptedDetails,
        parsedRecord.invoice_hash as AleoField,
        flowHashInput
      );
      expect(isValid).toBe(true);
      expect(decryptedDetails).toEqual(invoiceDetails);
    });

    it('should detect when local data has been tampered with', async () => {
      const originalDetails: InvoiceDetails = {
        invoiceNumber: 'INV-TAMPER-TEST-001',
        lineItems: [{ description: 'Item', quantity: 1, unitPrice: 500, amount: 500 }],
        subtotal: 500,
        taxRate: 0.1,
        taxAmount: 50,
        total: 550,
        currency: 'USD'
      };
      const chainInvoiceHash = await service.computeInvoiceHash(originalDetails);
      const masterKey = 'test-master-key';
      const encryptedPayload = await service.encryptPayload(originalDetails, masterKey);
      const decryptedDetails = await service.decryptPayload(encryptedPayload, masterKey);
      const tamperedDetails: InvoiceDetails = {
        ...decryptedDetails,
        lineItems: [{ description: 'Item', quantity: 1, unitPrice: 50, amount: 50 }],
        subtotal: 50,
        total: 55
      };
      const isValid = await service.verifyInvoiceIntegrity(tamperedDetails, chainInvoiceHash);
      expect(isValid).toBe(false);
    });

    it('should detect tampering with Wave 2 context', async () => {
      const chainHash = await service.computeInvoiceHash(toContractParams(mockDetails, mockChainComputed));
      const masterKey = 'test-master-key';
      const encryptedPayload = await service.encryptPayload(mockDetails, masterKey);
      const decryptedDetails = await service.decryptPayload(encryptedPayload, masterKey);
      const tamperedDetails = { ...decryptedDetails, taxAmount: 999 };
      const isValid = await service.verifyInvoiceIntegrity(
        tamperedDetails,
        chainHash,
        mockChainComputed
      );
      expect(isValid).toBe(false);
    });

    it('should handle the case of an incorrect key', async () => {
      // Arrange
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-KEY-ERROR-001',
        lineItems: [
          { description: 'Item', quantity: 1, unitPrice: 100, amount: 100 }
        ],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD'
      };

      const correctKey = 'correct-master-key';
      const wrongKey = 'wrong-master-key';

      // Encrypt with the correct key
      const encrypted = await service.encryptPayload(details, correctKey);

      // Act & Assert - decryption with the wrong key should fail
      await expect(
        service.decryptPayload(encrypted, wrongKey)
      ).rejects.toThrow(CryptoServiceError);
    });
  });

  describe('Error handling', () => {
    it('CryptoServiceError should contain the correct service name', () => {
      // Arrange & Act
      const error = new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Test error',
        { testDetail: 'test' }
      );

      // Assert
      expect(error.serviceName).toBe('Crypto');
      expect(error.code).toBe(CryptoError.ENCRYPTION_FAILED);
      expect(error.message).toBe('Test error');
      expect(error.details).toEqual({ testDetail: 'test' });
    });

    it('CryptoServiceError should correctly implement the is() method', () => {
      // Arrange
      const error = new CryptoServiceError(
        CryptoError.DECRYPTION_FAILED,
        'Test error'
      );

      // Act & Assert
      expect(error.is(CryptoError.DECRYPTION_FAILED)).toBe(true);
      expect(error.is(CryptoError.ENCRYPTION_FAILED)).toBe(false);
      expect(error.is(CryptoError.HASH_MISMATCH)).toBe(false);
    });

    it('CryptoServiceError should correctly implement the isOneOf() method', () => {
      // Arrange
      const error = new CryptoServiceError(
        CryptoError.DECRYPTION_FAILED,
        'Test error'
      );

      // Act & Assert
      expect(error.isOneOf([CryptoError.DECRYPTION_FAILED, CryptoError.ENCRYPTION_FAILED])).toBe(true);
      expect(error.isOneOf([CryptoError.ENCRYPTION_FAILED, CryptoError.HASH_MISMATCH])).toBe(false);
    });
  });

  describe('Field validation', () => {
    it('should validate a valid Field value', () => {
      // Arrange
      const validField = '123456789field' as AleoField;

      // Act & Assert
      expect(service.validateFieldValue(validField)).toBe(true);
    });

    it('should reject an out-of-range Field value', () => {
      // Arrange - use a value exceeding the modulus
      const invalidField = '99999999999999999999999999999999999999999999999999999999999999999999999999999999field' as AleoField;

      // Act & Assert
      expect(service.validateFieldValue(invalidField)).toBe(false);
    });

    it('should reject a negative Field value', () => {
      // Arrange
      const invalidField = '-123field' as AleoField;

      // Act & Assert
      expect(service.validateFieldValue(invalidField)).toBe(false);
    });

    it('should reject a malformed Field value', () => {
      // Arrange
      const invalidField = 'not-a-number-field' as AleoField;

      // Act & Assert
      expect(service.validateFieldValue(invalidField)).toBe(false);
    });

    it('hashes generated by computeInvoiceHash should always be within the valid range', async () => {
      // Arrange - create multiple different invoices for testing
      const testCases: InvoiceDetails[] = [
        {
          invoiceNumber: 'INV-001',
          lineItems: [],
          subtotal: 100,
          taxRate: 0,
          taxAmount: 0,
          total: 100,
          currency: 'USD'
        },
        {
          invoiceNumber: 'INV-002',
          lineItems: [
            { description: 'Item', quantity: 999999, unitPrice: 999999, amount: 999999999 }
          ],
          subtotal: 999999999,
          taxRate: 0.99,
          taxAmount: 989999990.01,
          total: 1989999989.01,
          currency: 'EUR'
        },
        {
          invoiceNumber: 'INV-003-LONG-NUMBER-TEST',
          lineItems: [],
          subtotal: 1e15,
          taxRate: 0,
          taxAmount: 0,
          total: 1e15,
          currency: 'GBP',
          notes: 'Test with very large numbers to ensure modulo arithmetic works correctly'
        }
      ];

      // Act & Assert
      for (const details of testCases) {
        const hash = await service.computeInvoiceHash(details);
        expect(service.validateFieldValue(hash)).toBe(true);
        expect(hash).toMatch(/^\d+field$/);
      }
    });
  });

  describe('deriveMasterKey', () => {
    it('should successfully derive a master key from a signature', async () => {
      // Arrange
      const signature = 'test_signature_123456789';

      // Act
      const masterKey = await service.deriveMasterKey(signature);

      // Assert
      expect(masterKey).toBeDefined();
      expect(typeof masterKey).toBe('string');
      expect(masterKey.length).toBe(64); // SHA-256 hash hex string length is 64
    });

    it('the same signature should produce the same master key (deterministic)', async () => {
      // Arrange
      const signature = 'test_signature_123456789';

      // Act
      const masterKey1 = await service.deriveMasterKey(signature);
      const masterKey2 = await service.deriveMasterKey(signature);

      // Assert
      expect(masterKey1).toBe(masterKey2);
    });

    it('different signatures should produce different master keys', async () => {
      // Arrange
      const signature1 = 'test_signature_123456789';
      const signature2 = 'test_signature_987654321';

      // Act
      const masterKey1 = await service.deriveMasterKey(signature1);
      const masterKey2 = await service.deriveMasterKey(signature2);

      // Assert
      expect(masterKey1).not.toBe(masterKey2);
    });

    it('should throw an error when the signature is empty', async () => {
      // Act & Assert
      await expect(service.deriveMasterKey('')).rejects.toThrow('Signature cannot be empty');
      await expect(service.deriveMasterKey('   ')).rejects.toThrow('Signature cannot be empty');
    });

    it('should correctly handle various signature formats', async () => {
      // Arrange
      const signatures = [
        'simple_signature',
        'signature_with_special_chars_!@#$%^&*()',
        'signature_with_numbers_1234567890',
        'signature_with_unicode_test_signature',
        'a'.repeat(100), // Long signature
      ];

      // Act & Assert
      for (const signature of signatures) {
        const masterKey = await service.deriveMasterKey(signature);
        expect(masterKey).toBeDefined();
        expect(typeof masterKey).toBe('string');
        expect(masterKey.length).toBe(64); // SHA-256 hash hex string length is 64
      }
    });

    it('the master key should be a valid hexadecimal string', async () => {
      // Arrange
      const signature = 'test_signature';

      // Act
      const masterKey = await service.deriveMasterKey(signature);

      // Assert
      expect(masterKey).toMatch(/^[0-9a-f]{64}$/); // 64 hexadecimal characters
    });

    it('should throw a CryptoServiceError type error', async () => {
      // Act & Assert
      await expect(service.deriveMasterKey('')).rejects.toThrow(CryptoServiceError);
    });
  });

  describe('generateAuditKey', () => {
    it('should generate a valid hex audit key', () => {
      // Act
      const auditKey = service.generateAuditKey();

      // Assert
      expect(auditKey).toBeDefined();
      expect(typeof auditKey).toBe('string');
      expect(auditKey.length).toBe(64); // 32 bytes = 64 hex characters
      expect(auditKey).toMatch(/^[0-9a-f]{64}$/); // Valid hex string
    });

    it('should generate different keys on each call (random)', () => {
      // Act
      const key1 = service.generateAuditKey();
      const key2 = service.generateAuditKey();
      const key3 = service.generateAuditKey();

      // Assert
      expect(key1).not.toBe(key2);
      expect(key2).not.toBe(key3);
      expect(key1).not.toBe(key3);
    });

    it('should generate keys that are usable with auditKeyToBytes', () => {
      // Act
      const auditKey = service.generateAuditKey();
      const bytes = service.auditKeyToBytes(auditKey);

      // Assert
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32); // 64 hex chars = 32 bytes
    });

    it('should generate keys that work with the full encryption workflow', async () => {
      // Arrange
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-WORKFLOW-TEST',
        lineItems: [],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD'
      };

      // Act - Complete workflow
      const auditKey = service.generateAuditKey();
      const keyBytes = service.auditKeyToBytes(auditKey);
      const encrypted = await service.encryptWithAuditKey(details, keyBytes);
      const hash = await service.hashCipher(encrypted);

      // Assert
      expect(auditKey).toMatch(/^[0-9a-f]{64}$/);
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.ciphertext).toBeTruthy();
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate cryptographically strong keys (entropy check)', () => {
      // Act - Generate multiple keys and check for patterns
      const keys = Array.from({ length: 10 }, () => service.generateAuditKey());

      // Assert - All keys should be unique
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(10);

      // Assert - Keys should not have obvious patterns (all same char)
      keys.forEach(key => {
        const firstChar = key[0];
        const allSame = key.split('').every(char => char === firstChar);
        expect(allSame).toBe(false);
      });
    });

    it('should handle multiple rapid generations without collision', () => {
      // Act - Generate many keys rapidly
      const keys = Array.from({ length: 100 }, () => service.generateAuditKey());

      // Assert - All should be unique
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(100);
    });

    it('should generate keys with proper length for AES-256', () => {
      // Act
      const auditKey = service.generateAuditKey();
      const bytes = service.auditKeyToBytes(auditKey);

      // Assert - 32 bytes = 256 bits (suitable for AES-256)
      expect(bytes.length).toBe(32);
    });

    it('should always return lowercase hexadecimal', () => {
      // Act
      const keys = Array.from({ length: 5 }, () => service.generateAuditKey());

      // Assert
      keys.forEach(key => {
        expect(key).toMatch(/^[0-9a-f]+$/); // Only lowercase
        expect(key).not.toMatch(/[A-F]/); // No uppercase
      });
    });
  });

  describe('auditKeyToBytes', () => {
    it('should successfully convert a valid hex audit key to Uint8Array', () => {
      // Arrange
      const auditKey = 'abcdef0123456789abcdef0123456789'; // 32 hex characters

      // Act
      const result = service.auditKeyToBytes(auditKey);

      // Assert
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(16); // 32 hex chars = 16 bytes
    });

    it('should handle uppercase hex characters', () => {
      // Arrange
      const auditKey = 'ABCDEF0123456789ABCDEF0123456789';

      // Act
      const result = service.auditKeyToBytes(auditKey);

      // Assert
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(16);
    });

    it('should handle mixed case hex characters', () => {
      // Arrange
      const auditKey = 'AbCdEf0123456789aBcDeF0123456789';

      // Act
      const result = service.auditKeyToBytes(auditKey);

      // Assert
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(16);
    });

    it('should handle long audit keys (64+ hex characters)', () => {
      // Arrange
      const auditKey = 'a'.repeat(64); // 64 hex characters

      // Act
      const result = service.auditKeyToBytes(auditKey);

      // Assert
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(32); // 64 hex chars = 32 bytes
    });

    it('should throw an error for non-hex characters', () => {
      // Arrange
      const invalidKey = 'ghijklmnopqrstuvwxyz123456789012'; // Contains g-z

      // Act & Assert
      expect(() => service.auditKeyToBytes(invalidKey)).toThrow('must be hexadecimal');
      expect(() => service.auditKeyToBytes(invalidKey)).toThrow(CryptoServiceError);
    });

    it('should throw an error for keys shorter than 32 characters', () => {
      // Arrange
      const shortKey = 'abcdef0123456789'; // Only 16 hex characters

      // Act & Assert
      expect(() => service.auditKeyToBytes(shortKey)).toThrow('at least 32 hex characters');
      expect(() => service.auditKeyToBytes(shortKey)).toThrow(CryptoServiceError);
    });

    it('should throw an error for empty string', () => {
      // Act & Assert
      expect(() => service.auditKeyToBytes('')).toThrow('non-empty string');
      expect(() => service.auditKeyToBytes('')).toThrow(CryptoServiceError);
    });

    it('should throw an error for non-string input', () => {
      // Act & Assert
      expect(() => service.auditKeyToBytes(null as any)).toThrow('non-empty string');
      expect(() => service.auditKeyToBytes(undefined as any)).toThrow('non-empty string');
      expect(() => service.auditKeyToBytes(123 as any)).toThrow('non-empty string');
    });

    it('should produce the same bytes for the same audit key (deterministic)', () => {
      // Arrange
      const auditKey = 'abcdef0123456789abcdef0123456789';

      // Act
      const result1 = service.auditKeyToBytes(auditKey);
      const result2 = service.auditKeyToBytes(auditKey);

      // Assert
      expect(result1).toEqual(result2);
    });

    it('should produce different bytes for different audit keys', () => {
      // Arrange
      const auditKey1 = 'abcdef0123456789abcdef0123456789';
      const auditKey2 = 'fedcba9876543210fedcba9876543210';

      // Act
      const result1 = service.auditKeyToBytes(auditKey1);
      const result2 = service.auditKeyToBytes(auditKey2);

      // Assert
      expect(result1).not.toEqual(result2);
    });
  });

  describe('hashCipher', () => {
    it('should successfully hash a valid encrypted payload', async () => {
      // Arrange
      const payload: EncryptedPayload = {
        iv: Buffer.from('test-iv-data').toString('base64'),
        ciphertext: Buffer.from('test-ciphertext-data').toString('base64')
      };

      // Act
      const hash = await service.hashCipher(payload);

      // Assert
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 hex string is 64 characters
      expect(hash).toMatch(/^[0-9a-f]{64}$/); // Valid hex string
    });

    it('should produce the same hash for the same payload (deterministic)', async () => {
      // Arrange
      const payload: EncryptedPayload = {
        iv: Buffer.from('test-iv').toString('base64'),
        ciphertext: Buffer.from('test-ciphertext').toString('base64')
      };

      // Act
      const hash1 = await service.hashCipher(payload);
      const hash2 = await service.hashCipher(payload);

      // Assert
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different payloads', async () => {
      // Arrange
      const payload1: EncryptedPayload = {
        iv: Buffer.from('test-iv-1').toString('base64'),
        ciphertext: Buffer.from('test-ciphertext-1').toString('base64')
      };
      const payload2: EncryptedPayload = {
        iv: Buffer.from('test-iv-2').toString('base64'),
        ciphertext: Buffer.from('test-ciphertext-2').toString('base64')
      };

      // Act
      const hash1 = await service.hashCipher(payload1);
      const hash2 = await service.hashCipher(payload2);

      // Assert
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes if only IV changes', async () => {
      // Arrange
      const payload1: EncryptedPayload = {
        iv: Buffer.from('iv-1').toString('base64'),
        ciphertext: Buffer.from('same-ciphertext').toString('base64')
      };
      const payload2: EncryptedPayload = {
        iv: Buffer.from('iv-2').toString('base64'),
        ciphertext: Buffer.from('same-ciphertext').toString('base64')
      };

      // Act
      const hash1 = await service.hashCipher(payload1);
      const hash2 = await service.hashCipher(payload2);

      // Assert
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes if only ciphertext changes', async () => {
      // Arrange
      const payload1: EncryptedPayload = {
        iv: Buffer.from('same-iv').toString('base64'),
        ciphertext: Buffer.from('ciphertext-1').toString('base64')
      };
      const payload2: EncryptedPayload = {
        iv: Buffer.from('same-iv').toString('base64'),
        ciphertext: Buffer.from('ciphertext-2').toString('base64')
      };

      // Act
      const hash1 = await service.hashCipher(payload1);
      const hash2 = await service.hashCipher(payload2);

      // Assert
      expect(hash1).not.toBe(hash2);
    });

    it('should throw an error for missing iv', async () => {
      // Arrange
      const invalidPayload: any = {
        ciphertext: Buffer.from('test-ciphertext').toString('base64')
      };

      // Act & Assert
      await expect(service.hashCipher(invalidPayload)).rejects.toThrow('missing iv or ciphertext');
      await expect(service.hashCipher(invalidPayload)).rejects.toThrow(CryptoServiceError);
    });

    it('should throw an error for missing ciphertext', async () => {
      // Arrange
      const invalidPayload: any = {
        iv: Buffer.from('test-iv').toString('base64')
      };

      // Act & Assert
      await expect(service.hashCipher(invalidPayload)).rejects.toThrow('missing iv or ciphertext');
      await expect(service.hashCipher(invalidPayload)).rejects.toThrow(CryptoServiceError);
    });

    it('should throw an error for null payload', async () => {
      // Act & Assert
      await expect(service.hashCipher(null as any)).rejects.toThrow('missing iv or ciphertext');
      await expect(service.hashCipher(null as any)).rejects.toThrow(CryptoServiceError);
    });

    it('should handle real encrypted payload from encryptPayload', async () => {
      // Arrange
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD'
      };
      const masterKey = 'test-master-key-1234567890123456';
      const encrypted = await service.encryptPayload(details, masterKey);

      // Act
      const hash = await service.hashCipher(encrypted);

      // Assert
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('encryptWithAuditKey', () => {
    it('should successfully encrypt invoice details with audit key', async () => {
      // Arrange
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-AUDIT-001',
        lineItems: [
          { description: 'Item 1', quantity: 1, unitPrice: 100, amount: 100 }
        ],
        subtotal: 100,
        taxRate: 0.1,
        taxAmount: 10,
        total: 110,
        currency: 'USD'
      };
      const auditKey = new Uint8Array(32).fill(0xaa); // 32 bytes of 0xaa

      // Act
      const encrypted = await service.encryptWithAuditKey(details, auditKey);

      // Assert
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.ciphertext).toBeTruthy();
      expect(typeof encrypted.iv).toBe('string');
      expect(typeof encrypted.ciphertext).toBe('string');
    });

    it('should encrypt and decrypt round-trip successfully', async () => {
      // Arrange
      const originalDetails: InvoiceDetails = {
        invoiceNumber: 'INV-ROUNDTRIP-001',
        lineItems: [
          { description: 'Product A', quantity: 5, unitPrice: 123.45, amount: 617.25 }
        ],
        subtotal: 617.25,
        taxRate: 0.13,
        taxAmount: 80.24,
        total: 697.49,
        currency: 'CAD',
        notes: 'Test audit encryption'
      };
      const auditKey = new Uint8Array(32).fill(0xbb);

      // Act
      const encrypted = await service.encryptWithAuditKey(originalDetails, auditKey);
      // Note: We'd need a decryptWithAuditKey method for full round-trip, but we can use lib function
      const decrypted = await service.decryptWithRawKey(encrypted, auditKey);

      // Assert
      expect(decrypted).toEqual(originalDetails);
    });

    it('should encrypt partial invoice data (filtered by permissions)', async () => {
      // Arrange
      const partialInvoice = {
        id: '123field',
        invoiceHash: '456field',
        amount: 1000000,
        seller: 'aleo1seller',
        buyer: 'aleo1buyer'
      };
      const auditKey = new Uint8Array(32).fill(0xcc);

      // Act
      const encrypted = await service.encryptWithAuditKey(partialInvoice, auditKey);

      // Assert
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('ciphertext');
    });

    it('should produce different ciphertexts for same data (random IV)', async () => {
      // Arrange
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD'
      };
      const auditKey = new Uint8Array(32).fill(0xdd);

      // Act
      const encrypted1 = await service.encryptWithAuditKey(details, auditKey);
      const encrypted2 = await service.encryptWithAuditKey(details, auditKey);

      // Assert
      expect(encrypted1.iv).not.toBe(encrypted2.iv); // Different IVs
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext); // Different ciphertexts
    });

    it('should throw an error for null or undefined details', async () => {
      // Arrange
      const auditKey = new Uint8Array(32).fill(0xee);

      // Act & Assert
      await expect(service.encryptWithAuditKey(null as any, auditKey))
        .rejects.toThrow('Details cannot be null or undefined');
      await expect(service.encryptWithAuditKey(undefined as any, auditKey))
        .rejects.toThrow('Details cannot be null or undefined');
    });

    it('should throw an error for non-Uint8Array audit key', async () => {
      // Arrange
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD'
      };

      // Act & Assert
      await expect(service.encryptWithAuditKey(details, 'not-a-uint8array' as any))
        .rejects.toThrow('Audit key must be a Uint8Array');
      await expect(service.encryptWithAuditKey(details, null as any))
        .rejects.toThrow('Audit key must be a Uint8Array');
    });

    it('should throw an error for audit key shorter than 16 bytes', async () => {
      // Arrange
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD'
      };
      const shortKey = new Uint8Array(8).fill(0xff); // Only 8 bytes

      // Act & Assert
      await expect(service.encryptWithAuditKey(details, shortKey))
        .rejects.toThrow('at least 16 bytes');
      await expect(service.encryptWithAuditKey(details, shortKey))
        .rejects.toThrow(CryptoServiceError);
    });

    it('should handle minimum valid key size (16 bytes)', async () => {
      // Arrange
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-001',
        lineItems: [],
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD'
      };
      const minKey = new Uint8Array(16).fill(0x11); // Exactly 16 bytes

      // Act
      const encrypted = await service.encryptWithAuditKey(details, minKey);

      // Assert
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('ciphertext');
    });

    it('should throw CryptoServiceError type error', async () => {
      // Arrange
      const auditKey = new Uint8Array(32).fill(0x22);

      // Act & Assert
      await expect(service.encryptWithAuditKey(null as any, auditKey))
        .rejects.toThrow(CryptoServiceError);
    });

    it('should work with real audit key from auditKeyToBytes', async () => {
      // Arrange - Complete workflow
      const details: InvoiceDetails = {
        invoiceNumber: 'INV-WORKFLOW-001',
        lineItems: [],
        subtotal: 500,
        taxRate: 0.1,
        taxAmount: 50,
        total: 550,
        currency: 'USD'
      };
      const hexAuditKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
      
      // Act - Convert hex to bytes then encrypt
      const auditKeyBytes = service.auditKeyToBytes(hexAuditKey);
      const encrypted = await service.encryptWithAuditKey(details, auditKeyBytes);
      const hash = await service.hashCipher(encrypted);

      // Assert
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.ciphertext).toBeTruthy();
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
