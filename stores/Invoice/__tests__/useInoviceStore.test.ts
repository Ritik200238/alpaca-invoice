import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { Invoice, InvoiceStatus, InvoiceDetails } from '@/lib/types';

// Mock services (must be before importing the store, using vi.hoisted to ensure hoisting)
const { mockStorageService, mockCryptoService } = vi.hoisted(() => {
  const mockStorageService = {
    addData: vi.fn().mockResolvedValue(undefined),
    getData: vi.fn().mockResolvedValue(undefined),
    getAllData: vi.fn().mockResolvedValue([]),
    updateData: vi.fn().mockResolvedValue(undefined)
  };

  const mockCryptoService = {
    encryptPayload: vi.fn().mockResolvedValue({ iv: 'test-iv', ciphertext: 'encrypted-data' }),
    decryptPayload: vi.fn().mockResolvedValue({
      invoiceNumber: 'INV-001',
      lineItems: [{ description: 'Item 1', quantity: 2, unitPrice: 100, amount: 200 }],
      subtotal: 200,
      taxRate: 0.1,
      taxAmount: 20,
      total: 220,
      currency: 'USD'
    })
  };

  return { mockStorageService, mockCryptoService };
});

vi.mock('@/services/StorageService/StorageServiceImpl', () => ({
  StorageService: vi.fn().mockImplementation(() => mockStorageService)
}));

vi.mock('@/services/CryptoService/CryptoServiceImpl', () => ({
  CryptoService: vi.fn().mockImplementation(() => mockCryptoService)
}));

// Import store after mocks
import { useInvoiceStore } from '../useInoviceStore';

describe('useInvoiceStore', () => {
  const masterKey = 'test-master-key';
  const INVOICE_TABLE = 'invoices';

  // Test data
  const mockInvoiceDetails: InvoiceDetails = {
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

  const mockInvoice: Invoice = {
    id: '1field' as any,
    invoiceHash: 'hash1field' as any,
    seller: 'aleo1seller123' as any,
    buyer: 'aleo1buyer456' as any,
    amount: BigInt('1000000'),
    dueDate: new Date('2024-12-31'),
    createdAt: new Date('2024-01-01'),
    status: InvoiceStatus.PENDING,
    details: mockInvoiceDetails
  };

  const mockEncryptedDetails = {
    iv: 'test-iv',
    ciphertext: 'encrypted-data'
  };

  beforeEach(() => {
    // Reset store state (including currentInvoice)
    useInvoiceStore.setState({ invoices: [], currentInvoice: null });

    // Reset all mocks
    vi.clearAllMocks();

    // Reset mock return values
    mockStorageService.addData.mockResolvedValue(undefined);
    mockStorageService.getData.mockResolvedValue(undefined);
    mockStorageService.getAllData.mockResolvedValue([]);
    mockStorageService.updateData.mockResolvedValue(undefined);
    mockCryptoService.encryptPayload.mockResolvedValue(mockEncryptedDetails);
    mockCryptoService.decryptPayload.mockResolvedValue(mockInvoiceDetails);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('addInvoice', () => {
    it('should successfully add an invoice to memory and IndexedDB', async () => {
      const store = useInvoiceStore.getState();

      await store.addInvoice(mockInvoice, { masterKey, persistFull: true });

      // Verify memory state
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(1);
      // Verify basic invoice fields
      expect(state.invoices[0].id).toBe(mockInvoice.id);
      expect(state.invoices[0].invoiceHash).toBe(mockInvoice.invoiceHash);
      expect(state.invoices[0].seller).toBe(mockInvoice.seller);
      expect(state.invoices[0].buyer).toBe(mockInvoice.buyer);
      expect(state.invoices[0].amount).toBe(mockInvoice.amount);
      expect(state.invoices[0].status).toBe(mockInvoice.status);
      expect(state.invoices[0].details).toEqual(mockInvoice.details);
      // Verify auto-added metadata
      expect(state.invoices[0].metadata).toBeDefined();
      expect(state.invoices[0].metadata?.confirmationStatus).toBe('SENDING');
      expect(state.invoices[0].metadata?.dataSource).toBe('local');
      expect(state.invoices[0].metadata?.lastUpdated).toBeInstanceOf(Date);

      // Verify crypto service call
      expect(mockCryptoService.encryptPayload).toHaveBeenCalledWith(
        mockInvoiceDetails,
        masterKey
      );

      // Verify storage service call
      expect(mockStorageService.addData).toHaveBeenCalledWith(
        INVOICE_TABLE,
        mockInvoice.id,
        expect.objectContaining({
          id: mockInvoice.id,
          invoiceHash: mockInvoice.invoiceHash,
          seller: mockInvoice.seller,
          buyer: mockInvoice.buyer,
          amount: mockInvoice.amount,
          encryptedDetails: mockEncryptedDetails,
          metadata: expect.objectContaining({
            confirmationStatus: 'SENDING',
            dataSource: 'local'
          })
        })
      );
    });

    it('should only update memory when masterKey is not provided', async () => {
      const store = useInvoiceStore.getState();

      await store.addInvoice(mockInvoice, { persistFull: true });

      // Verify memory state
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(1);

      // Verify storage service was not called
      expect(mockStorageService.addData).not.toHaveBeenCalled();
      expect(mockCryptoService.encryptPayload).not.toHaveBeenCalled();
    });

    it('should only update memory when persistFull is false', async () => {
      const store = useInvoiceStore.getState();

      await store.addInvoice(mockInvoice, { masterKey, persistFull: false });

      // Verify memory state
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(1);

      // Verify storage service was not called
      expect(mockStorageService.addData).not.toHaveBeenCalled();
    });

    it('should handle invoices without details', async () => {
      const invoiceWithoutDetails = { ...mockInvoice, details: undefined };
      const store = useInvoiceStore.getState();

      await store.addInvoice(invoiceWithoutDetails, { masterKey, persistFull: true });

      // Verify encryptedDetails is null during storage
      expect(mockStorageService.addData).toHaveBeenCalledWith(
        INVOICE_TABLE,
        invoiceWithoutDetails.id,
        expect.objectContaining({
          encryptedDetails: null
        })
      );
    });

    it('should throw an error on storage failure and not update memory (keep database and memory in sync)', async () => {
      const store = useInvoiceStore.getState();
      const error = new Error('Storage failed');
      mockStorageService.addData.mockRejectedValue(error);

      await expect(
        store.addInvoice(mockInvoice, { masterKey, persistFull: true })
      ).rejects.toThrow('Storage failed');

      // Verify memory state was not updated (keep database and memory in sync)
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(0);
    });
  });

  describe('updateInvoice', () => {
    beforeEach(() => {
      // First add an invoice to memory (with metadata)
      const invoiceWithMetadata = {
        ...mockInvoice,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date('2024-01-01'),
          dataSource: 'local' as const
        }
      };
      useInvoiceStore.setState({ invoices: [invoiceWithMetadata] });
    });

    it('should successfully update an invoice', async () => {
      const store = useInvoiceStore.getState();
      const existingStorageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getData.mockResolvedValue(existingStorageData);

      const updates = { status: InvoiceStatus.PAID };
      await store.updateInvoice(mockInvoice.id, updates, { masterKey, persistFull: true });

      // Verify memory state
      const state = useInvoiceStore.getState();
      expect(state.invoices[0].status).toBe(InvoiceStatus.PAID);

      // Verify storage service call
      expect(mockStorageService.getData).toHaveBeenCalledWith(INVOICE_TABLE, mockInvoice.id);
      expect(mockStorageService.updateData).toHaveBeenCalledWith(
        INVOICE_TABLE,
        mockInvoice.id,
        expect.objectContaining({
          status: InvoiceStatus.PAID
        })
      );
    });

    it('should return early when the invoice does not exist', async () => {
      const store = useInvoiceStore.getState();
      const nonExistentId = '999field' as any;

      await store.updateInvoice(nonExistentId, { status: InvoiceStatus.PAID }, { masterKey });

      // Verify storage service was not called
      expect(mockStorageService.getData).not.toHaveBeenCalled();
      expect(mockStorageService.updateData).not.toHaveBeenCalled();
    });

    it('should return early when the invoice is not found in IndexedDB', async () => {
      const store = useInvoiceStore.getState();
      mockStorageService.getData.mockResolvedValue(undefined);

      await store.updateInvoice(mockInvoice.id, { status: InvoiceStatus.PAID }, { masterKey, persistFull: true });

      // Verify updateData was not called
      expect(mockStorageService.updateData).not.toHaveBeenCalled();
    });

    it('should re-encrypt when updating details', async () => {
      const store = useInvoiceStore.getState();
      const existingStorageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getData.mockResolvedValue(existingStorageData);

      const newDetails: InvoiceDetails = {
        ...mockInvoiceDetails,
        invoiceNumber: 'INV-002'
      };

      await store.updateInvoice(mockInvoice.id, { details: newDetails }, { masterKey, persistFull: true });

      // Verify re-encryption
      expect(mockCryptoService.encryptPayload).toHaveBeenCalledWith(newDetails, masterKey);
    });

    it('should only update memory when masterKey is not provided', async () => {
      const store = useInvoiceStore.getState();

      await store.updateInvoice(mockInvoice.id, { status: InvoiceStatus.PAID }, { persistFull: true });

      // Verify memory state
      const state = useInvoiceStore.getState();
      expect(state.invoices[0].status).toBe(InvoiceStatus.PAID);

      // Verify storage service was not called
      expect(mockStorageService.getData).not.toHaveBeenCalled();
    });

    it('should throw an error on storage failure and not update memory (keep database and memory in sync)', async () => {
      const store = useInvoiceStore.getState();
      const existingStorageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getData.mockResolvedValue(existingStorageData);
      const error = new Error('Storage update failed');
      mockStorageService.updateData.mockRejectedValue(error);

      await expect(
        store.updateInvoice(mockInvoice.id, { status: InvoiceStatus.PAID }, { masterKey, persistFull: true })
      ).rejects.toThrow('Storage update failed');

      // Verify memory state was not updated (keep database and memory in sync)
      const state = useInvoiceStore.getState();
      expect(state.invoices[0].status).toBe(InvoiceStatus.PENDING); // Maintains original state
    });

    it('should prioritize currentInvoice over data in invoices', async () => {
      // Set up currentInvoice and invoices with inconsistent data
      const currentInvoiceWithMetadata = {
        ...mockInvoice,
        status: InvoiceStatus.CANCELLED, // Status in currentInvoice is CANCELLED
        metadata: {
          confirmationStatus: 'CONFIRMED' as const,
          lastUpdated: new Date('2024-01-02'),
          dataSource: 'chain' as const
        }
      };

      const invoiceInList = {
        ...mockInvoice,
        status: InvoiceStatus.PENDING, // Status in invoices is PENDING
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date('2024-01-01'),
          dataSource: 'local' as const
        }
      };

      useInvoiceStore.setState({
        invoices: [invoiceInList],
        currentInvoice: currentInvoiceWithMetadata
      });

      const store = useInvoiceStore.getState();
      const existingStorageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: InvoiceStatus.CANCELLED, // Status in IndexedDB
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'CONFIRMED' as const,
          lastUpdated: new Date('2024-01-02'),
          dataSource: 'chain' as const
        }
      };

      mockStorageService.getData.mockResolvedValue(existingStorageData);

      // Update status to PAID
      await store.updateInvoice(mockInvoice.id, { status: InvoiceStatus.PAID }, { masterKey, persistFull: true });

      // Verify updated invoice is based on currentInvoice (should contain currentInvoice's metadata)
      const state = useInvoiceStore.getState();
      expect(state.invoices[0].status).toBe(InvoiceStatus.PAID);
      expect(state.invoices[0].metadata).toEqual({
        confirmationStatus: 'CONFIRMED',
        lastUpdated: expect.any(Date),
        dataSource: 'chain'
      });

      // Verify currentInvoice was also correctly updated
      expect(state.currentInvoice?.status).toBe(InvoiceStatus.PAID);
      expect(state.currentInvoice?.metadata).toEqual({
        confirmationStatus: 'CONFIRMED',
        lastUpdated: expect.any(Date),
        dataSource: 'chain'
      });
    });

    it('should correctly merge metadata (metadata in updates should override existing)', async () => {
      const invoiceWithMetadata = {
        ...mockInvoice,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date('2024-01-01'),
          dataSource: 'local' as const
        }
      };

      useInvoiceStore.setState({
        invoices: [invoiceWithMetadata],
        currentInvoice: invoiceWithMetadata
      });

      const store = useInvoiceStore.getState();
      const existingStorageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date('2024-01-01'),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getData.mockResolvedValue(existingStorageData);

      // Update metadata
      const newMetadata = {
        confirmationStatus: 'CONFIRMED' as const,
        lastUpdated: new Date(),
        dataSource: 'chain' as const
      };

      await store.updateInvoice(mockInvoice.id, { metadata: newMetadata }, { masterKey, persistFull: true });

      // Verify metadata was correctly updated
      const state = useInvoiceStore.getState();
      expect(state.invoices[0].metadata?.confirmationStatus).toBe('CONFIRMED');
      expect(state.invoices[0].metadata?.dataSource).toBe('chain');
      expect(state.invoices[0].metadata?.lastUpdated).toBeInstanceOf(Date);

      // Verify currentInvoice was also correctly updated
      expect(state.currentInvoice?.metadata?.confirmationStatus).toBe('CONFIRMED');
      expect(state.currentInvoice?.metadata?.dataSource).toBe('chain');
    });

    it('should look up from invoices when currentInvoice is not available', async () => {
      useInvoiceStore.setState({
        invoices: [mockInvoice],
        currentInvoice: null
      });

      const store = useInvoiceStore.getState();
      const existingStorageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getData.mockResolvedValue(existingStorageData);

      await store.updateInvoice(mockInvoice.id, { status: InvoiceStatus.PAID }, { masterKey, persistFull: true });

      // Verify update succeeded
      const state = useInvoiceStore.getState();
      expect(state.invoices[0].status).toBe(InvoiceStatus.PAID);
      expect(state.currentInvoice).toBeNull(); // currentInvoice should remain null
    });
  });

  describe('getInvoiceByHash', () => {
    it('should return an invoice from memory', async () => {
      useInvoiceStore.setState({ invoices: [mockInvoice] });
      const store = useInvoiceStore.getState();

      const result = await store.getInvoiceByHash(mockInvoice.invoiceHash, { masterKey });

      expect(result).toEqual(mockInvoice);
      expect(mockStorageService.getAllData).not.toHaveBeenCalled();
    });

    it('should load an invoice from IndexedDB (when not in memory)', async () => {
      const storageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getAllData.mockResolvedValue([storageData]);
      const store = useInvoiceStore.getState();

      const result = await store.getInvoiceByHash(mockInvoice.invoiceHash, { masterKey, loadFromDB: true });

      expect(result).toBeDefined();
      expect(result?.id).toBe(mockInvoice.id);
      expect(result?.invoiceHash).toBe(mockInvoice.invoiceHash);
      expect(result?.details).toEqual(mockInvoiceDetails);

      // Verify decryption call
      expect(mockCryptoService.decryptPayload).toHaveBeenCalledWith(mockEncryptedDetails, masterKey);

      // Verify memory state update
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(1);
    });

    it('should return null when the invoice is not found', async () => {
      mockStorageService.getAllData.mockResolvedValue([]);
      const store = useInvoiceStore.getState();

      const result = await store.getInvoiceByHash('nonexistent-hash' as any, { masterKey });

      expect(result).toBeNull();
    });

    it('should only search in memory when loadFromDB is false', async () => {
      const store = useInvoiceStore.getState();

      const result = await store.getInvoiceByHash(mockInvoice.invoiceHash, { masterKey, loadFromDB: false });

      expect(result).toBeNull();
      expect(mockStorageService.getAllData).not.toHaveBeenCalled();
    });

    it('should only search in memory when masterKey is not provided', async () => {
      const store = useInvoiceStore.getState();

      const result = await store.getInvoiceByHash(mockInvoice.invoiceHash, { loadFromDB: true });

      expect(result).toBeNull();
      expect(mockStorageService.getAllData).not.toHaveBeenCalled();
    });
  });

  describe('getAllInvoices', () => {
    it('should load all invoices from IndexedDB', async () => {
      const storageData1 = {
        id: '1field' as any,
        invoiceHash: 'hash1field' as any,
        seller: 'aleo1seller1' as any,
        buyer: 'aleo1buyer1' as any,
        amount: BigInt('1000000'),
        dueDate: new Date('2024-12-31'),
        createdAt: new Date('2024-01-01'),
        status: InvoiceStatus.PENDING,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      const storageData2 = {
        id: '2field' as any,
        invoiceHash: 'hash2field' as any,
        seller: 'aleo1seller2' as any,
        buyer: 'aleo1buyer2' as any,
        amount: BigInt('2000000'),
        dueDate: new Date('2024-12-31'),
        createdAt: new Date('2024-01-02'),
        status: InvoiceStatus.PAID,
        encryptedDetails: null,
        metadata: {
          confirmationStatus: 'CONFIRMED' as const,
          lastUpdated: new Date(),
          dataSource: 'chain' as const
        }
      };

      mockStorageService.getAllData.mockResolvedValue([storageData1, storageData2]);
      const store = useInvoiceStore.getState();

      const result = await store.getAllInvoices({ masterKey, refreshMemory: true });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1field');
      expect(result[0].details).toEqual(mockInvoiceDetails);
      expect(result[1].id).toBe('2field');
      expect(result[1].details).toBeUndefined();

      // Verify memory state update
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(2);
    });

    it('should not update memory when refreshMemory is false', async () => {
      const storageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getAllData.mockResolvedValue([storageData]);
      useInvoiceStore.setState({ invoices: [] });
      const store = useInvoiceStore.getState();

      await store.getAllInvoices({ masterKey, refreshMemory: false });

      // Verify memory state was not updated
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(0);
    });

    it('should handle decryption failure', async () => {
      const storageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getAllData.mockResolvedValue([storageData]);
      mockCryptoService.decryptPayload.mockRejectedValue(new Error('Decryption failed'));
      const store = useInvoiceStore.getState();

      const result = await store.getAllInvoices({ masterKey });

      // Verify basic info is returned even if decryption fails
      expect(result).toHaveLength(1);
      expect(result[0].details).toBeUndefined();
    });

    it('should return unencrypted invoices when masterKey is not provided', async () => {
      const storageData = {
        id: mockInvoice.id,
        invoiceHash: mockInvoice.invoiceHash,
        seller: mockInvoice.seller,
        buyer: mockInvoice.buyer,
        amount: mockInvoice.amount,
        dueDate: mockInvoice.dueDate,
        createdAt: mockInvoice.createdAt,
        status: mockInvoice.status,
        encryptedDetails: mockEncryptedDetails,
        metadata: {
          confirmationStatus: 'SENDING' as const,
          lastUpdated: new Date(),
          dataSource: 'local' as const
        }
      };

      mockStorageService.getAllData.mockResolvedValue([storageData]);
      const store = useInvoiceStore.getState();

      const result = await store.getAllInvoices({ refreshMemory: true });

      expect(result).toHaveLength(1);
      expect(result[0].details).toBeUndefined();
      expect(mockCryptoService.decryptPayload).not.toHaveBeenCalled();
    });
  });

  describe('setInvoices', () => {
    it('should batch set invoices to memory and IndexedDB', async () => {
      const invoices = [
        mockInvoice,
        { ...mockInvoice, id: '2field' as any, invoiceHash: 'hash2field' as any }
      ];

      const store = useInvoiceStore.getState();

      await store.setInvoices(invoices, { masterKey, persistFull: true });

      // Verify memory state
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(2);

      // Verify batch add call
      expect(mockStorageService.addData).toHaveBeenCalledWith(
        INVOICE_TABLE,
        expect.arrayContaining([
          expect.objectContaining({
            key: mockInvoice.id,
            data: expect.objectContaining({
              id: mockInvoice.id,
              invoiceHash: mockInvoice.invoiceHash
            })
          }),
          expect.objectContaining({
            key: '2field',
            data: expect.objectContaining({
              id: '2field',
              invoiceHash: 'hash2field'
            })
          })
        ])
      );
    });

    it('should only update memory when masterKey is not provided', async () => {
      const invoices = [mockInvoice];
      const store = useInvoiceStore.getState();

      await store.setInvoices(invoices, { persistFull: true });

      // Verify memory state
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(1);

      // Verify storage service was not called
      expect(mockStorageService.addData).not.toHaveBeenCalled();
    });

    it('should only update memory when persistFull is false', async () => {
      const invoices = [mockInvoice];
      const store = useInvoiceStore.getState();

      await store.setInvoices(invoices, { masterKey, persistFull: false });

      // Verify memory state
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(1);

      // Verify storage service was not called
      expect(mockStorageService.addData).not.toHaveBeenCalled();
    });

    it('should handle partial invoice encryption failure (continue processing other invoices)', async () => {
      const invoices = [
        mockInvoice,
        { ...mockInvoice, id: '2field' as any, invoiceHash: 'hash2field' as any }
      ];

      // Simulate encryption failure for the second invoice
      mockCryptoService.encryptPayload
        .mockResolvedValueOnce(mockEncryptedDetails)
        .mockRejectedValueOnce(new Error('Encryption failed'));

      const store = useInvoiceStore.getState();

      await store.setInvoices(invoices, { masterKey, persistFull: true });

      // Verify memory state is still updated (all invoices, because encryption failure does not fail the entire operation)
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(2);

      // Verify only the first invoice was successfully stored (second was skipped due to encryption failure)
      expect(mockStorageService.addData).toHaveBeenCalledWith(
        INVOICE_TABLE,
        expect.arrayContaining([
          expect.objectContaining({ key: mockInvoice.id })
        ])
      );
    });

    it('should throw an error on storage failure and not update memory (keep database and memory in sync)', async () => {
      const invoices = [
        mockInvoice,
        { ...mockInvoice, id: '2field' as any, invoiceHash: 'hash2field' as any }
      ];

      const error = new Error('Storage failed');
      mockStorageService.addData.mockRejectedValue(error);
      const store = useInvoiceStore.getState();

      await expect(
        store.setInvoices(invoices, { masterKey, persistFull: true })
      ).rejects.toThrow('Storage failed');

      // Verify memory state was not updated (keep database and memory in sync)
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(0);
    });

    it('should handle an empty array', async () => {
      const store = useInvoiceStore.getState();

      await store.setInvoices([], { masterKey, persistFull: true });

      // Verify memory state
      const state = useInvoiceStore.getState();
      expect(state.invoices).toHaveLength(0);

      // Verify storage service was not called (because dataList is empty)
      expect(mockStorageService.addData).not.toHaveBeenCalled();
    });
  });
});
