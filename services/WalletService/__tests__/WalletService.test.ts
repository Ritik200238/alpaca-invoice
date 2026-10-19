import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletService } from '../WalletServiceImpl';
import { WalletServiceError, WalletError } from '../IWalletService';
import { AleoAddress } from '@/lib/types';
import { PROGRAM_ID } from '@/lib/contract';
import type { WalletContextState } from '@provablehq/aleo-wallet-adaptor-react';

/** Mock wallet type: WalletContextState plus optional fields used by WalletService / tests */
type MockWallet = Partial<WalletContextState> & {
  publicKey?: string;
  requestRecordPlaintexts?: (program: string) => Promise<{ records: any[] } | any[]>;
  requestTransaction?: (params: any) => Promise<string>;
};

/**
 * WalletService Unit Tests
 *
 * Important notes:
 * 1. Mock objects are based on the real WalletContextState type (from @provablehq/aleo-wallet-adaptor-react)
 * 2. This is consistent with the useWallet() return type used in useWalletController
 * 3. Some extension methods (e.g., requestViewKey, network) use (as any) because they may be wallet plugin extensions
 * 4. Such mocks are closer to real usage scenarios, improving test accuracy
 */
describe('WalletService', () => {
  let mockWallet: MockWallet;
  let walletService: WalletService;
  const mockAddress: AleoAddress = 'aleo1test123456789abcdefghijklmnopqrstuvwxyz' as AleoAddress;

  beforeEach(() => {
    // Create a mock wallet instance based on the real WalletContextState type
    // This stays consistent with the type returned by the useWallet() hook
    mockWallet = {
      address: null,
      connected: false,
      connecting: false,
      disconnecting: false,
      reconnecting: false,
      wallet: null,
      wallets: [],
      autoConnect: false,
      network: null,
      selectWallet: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      signMessage: vi.fn().mockResolvedValue(new TextEncoder().encode('mock_signature_123456789')),
      requestRecords: vi.fn().mockResolvedValue([]),
      executeTransaction: vi.fn(),
      transactionStatus: vi.fn()
    };

    walletService = new WalletService(mockWallet as any);
  });

  describe('Constructor', () => {
    it('should successfully create a WalletService instance', () => {
      expect(walletService).toBeInstanceOf(WalletService);
    });
  });

  describe('connect', () => {
    it('should successfully connect the wallet', async () => {
      // Arrange
      mockWallet.connect = vi.fn().mockResolvedValue(undefined);

      // Act
      await walletService.connect();

      // Assert
      expect(mockWallet.connect).toHaveBeenCalledTimes(1);
    });

    it('should throw a friendly error message when the user rejects the connection', async () => {
      // Arrange
      mockWallet.connect = vi.fn().mockRejectedValue(new Error('User rejected the request'));

      // Act & Assert
      await expect(walletService.connect()).rejects.toThrow('User rejected the connection request');
    });

    it('should throw a friendly error message when the user rejects the connection (contains denied)', async () => {
      // Arrange
      mockWallet.connect = vi.fn().mockRejectedValue(new Error('Request denied'));

      // Act & Assert
      await expect(walletService.connect()).rejects.toThrow('User rejected the connection request');
    });

    it('should throw a detailed error message for other errors', async () => {
      // Arrange
      mockWallet.connect = vi.fn().mockRejectedValue(new Error('Network timeout'));

      // Act & Assert
      await expect(walletService.connect()).rejects.toThrow('Failed to connect wallet');
    });
  });

  describe('disconnect', () => {
    it('should successfully disconnect the wallet', async () => {
      // Arrange
      mockWallet.connected = true;

      // Act
      await walletService.disconnect();

      // Assert
      expect(mockWallet.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should catch the error and only log it (not throw) when disconnection fails', async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockWallet.disconnect = vi.fn().mockRejectedValue(new Error('Disconnect failed'));

      // Act
      await walletService.disconnect();

      // Assert
      expect(mockWallet.disconnect).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to disconnect wallet:', expect.any(Error));

      // Cleanup
      consoleSpy.mockRestore();
    });
  });

  describe('getPrivateBalance', () => {
    it('should successfully get the private balance', async () => {
      // Arrange
      const mockRecords = [
        { spent: false, data: { microcredits: '1000000u64.private' } },
        { spent: false, data: { microcredits: '2000000u64.private' } },
        { spent: true, data: { microcredits: '500000u64.private' } }, // Spent, not counted
      ];
      mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

      // Act
      const balance = await walletService.getPrivateBalance(mockAddress);

      // Assert
      expect(balance).toBe(3000000n);
      expect(mockWallet.requestRecords).toHaveBeenCalledWith('credits.aleo');
    });

    it('should filter out spent Records', async () => {
      // Arrange
      const mockRecords = [
        { spent: false, data: { microcredits: '1000000u64.private' } },
        { spent: true, data: { microcredits: '5000000u64.private' } },
        { spent: false, data: { microcredits: '2000000u64.private' } },
      ];
      mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

      // Act
      const balance = await walletService.getPrivateBalance(mockAddress);

      // Assert - only count unspent records
      expect(balance).toBe(3000000n);
    });

    it('should throw an error when the wallet is not connected', async () => {
      // Act & Assert
      await expect(walletService.getPrivateBalance('')).rejects.toThrow('Wallet not connected');
    });

    it('should return 0 when the wallet does not support requesting Records', async () => {
      // Arrange
      mockWallet.requestRecords = undefined;
      mockWallet.requestRecordPlaintexts = undefined;
      const serviceWithoutRecords = new WalletService(mockWallet as any);

      // Act
      const balance = await serviceWithoutRecords.getPrivateBalance(mockAddress);

      // Assert
      expect(balance).toBe(0n);
    });

    it('should return 0 when there are no Records', async () => {
      // Arrange
      mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: [] });

      // Act
      const balance = await walletService.getPrivateBalance(mockAddress);

      // Assert
      expect(balance).toBe(0n);
    });

    it('should use requestRecordPlaintexts as a fallback', async () => {
      // Arrange
      mockWallet.requestRecords = undefined;
      const mockRecords = [
        { spent: false, data: { microcredits: '1500000u64.private' } },
      ];
      mockWallet.requestRecordPlaintexts = vi.fn().mockResolvedValue({ records: mockRecords });
      const serviceWithPlaintexts = new WalletService(mockWallet as any);

      // Act
      const balance = await serviceWithPlaintexts.getPrivateBalance(mockAddress);

      // Assert
      expect(balance).toBe(1500000n);
      expect(mockWallet.requestRecordPlaintexts).toHaveBeenCalledWith('credits.aleo');
    });

    it('should parse recordPlaintext shape (Provable/Leo wallet format)', async () => {
      const mockRecords = [
        {
          spent: false,
          recordPlaintext: '{\n  owner: aleo14u86g3q3r3zmwwr89gjw78krpfv6ad27cneg837rxpxfd7e47cysee7qkz.private,\n  microcredits: 5000000u64.private,\n  _nonce: 6366549752431533238298243962540274543772062915283908425760580959061989746860group.public,\n  _version: 1u8.public\n}'
        }
      ];
      mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

      const balance = await walletService.getPrivateBalance(mockAddress);

      expect(balance).toBe(5000000n);
    });
  });

  describe('getFeeRecords', () => {
    describe('Strategy 1: Minimum Sufficient Method', () => {
      it('should return a single smallest Record that just meets the amount', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '3000000u64.private' } },
          { spent: false, data: { microcredits: '2000000u64.private' } }, // Smallest that satisfies
          { spent: false, data: { microcredits: '5000000u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act - request 1.5M, should select 2M (minimum sufficient)
        const records = await walletService.getFeeRecords(1500000n, mockAddress);

        // Assert
        expect(records.length).toBe(1);
        expect(mockWallet.requestRecords).toHaveBeenCalledWith('credits.aleo');

        const parsed = JSON.parse(records[0]);
        expect(parsed.data.microcredits).toBe('2000000u64.private');
      });

      it('should return a Record that exactly matches the required amount', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '1000000u64.private' } }, // Exact match
          { spent: false, data: { microcredits: '2000000u64.private' } },
          { spent: false, data: { microcredits: '3000000u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act - request 1M, should select the exact 1M one
        const records = await walletService.getFeeRecords(1000000n, mockAddress);

        // Assert
        expect(records.length).toBe(1);
        const parsed = JSON.parse(records[0]);
        expect(parsed.data.microcredits).toBe('1000000u64.private');
      });

      it('should select the smallest Record when multiple satisfy the requirement', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '5000000u64.private' } },
          { spent: false, data: { microcredits: '2000000u64.private' } }, // Minimum sufficient
          { spent: false, data: { microcredits: '3000000u64.private' } },
          { spent: false, data: { microcredits: '10000000u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act - request 1.5M
        const records = await walletService.getFeeRecords(1500000n, mockAddress);

        // Assert
        expect(records.length).toBe(1);
        const parsed = JSON.parse(records[0]);
        expect(parsed.data.microcredits).toBe('2000000u64.private');
      });

      it('should work with recordPlaintext shape (Provable/Leo wallet format)', async () => {
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const plaintext = '{\n  owner: aleo14u86g3q3r3zmwwr89gjw78krpfv6ad27cneg837rxpxfd7e47cysee7qkz.private,\n  microcredits: 5000000u64.private,\n  _nonce: 6366549752431533238298243962540274543772062915283908425760580959061989746860group.public,\n  _version: 1u8.public\n}';
        const mockRecords = [
          {
            spent: false,
            recordPlaintext: plaintext
          }
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        const records = await walletService.getFeeRecords(2000000n, mockAddress);

        expect(records.length).toBe(1);
        expect(records[0]).toContain('microcredits: 5000000u64.private');
      });

      it('should ignore spent Records', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: true, data: { microcredits: '2000000u64.private' } },  // Spent, ignore
          { spent: false, data: { microcredits: '3000000u64.private' } }, // Should select this one
          { spent: false, data: { microcredits: '5000000u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act
        const records = await walletService.getFeeRecords(2500000n, mockAddress);

        // Assert
        expect(records.length).toBe(1);
        const parsed = JSON.parse(records[0]);
        expect(parsed.spent).toBe(false);
        expect(parsed.data.microcredits).toBe('3000000u64.private');
      });
    });

    describe('Strategy 2: Multi-Record Combination Method', () => {
      it('should select a combination that exactly meets the amount (no change) when no single Record suffices', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '500000u64.private' } },
          { spent: false, data: { microcredits: '600000u64.private' } },
          { spent: false, data: { microcredits: '400000u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act - need 1M, no single Record suffices, need to combine
        const records = await walletService.getFeeRecords(1000000n, mockAddress);

        // Assert - should select 600000 + 400000 = 1000000 (exact, no change)
        expect(records.length).toBe(2);
        const totalAmount = records
          .map(r => JSON.parse(r))
          .reduce((sum, r) => {
            const match = r.data.microcredits.match(/^(\d+)/);
            return sum + (match ? BigInt(match[1]) : 0n);
          }, 0n);
        expect(totalAmount).toBe(1000000n); // Exact match, no change needed

        // Verify the correct combination is included
        const amounts = records.map(r => {
          const parsed = JSON.parse(r);
          const match = parsed.data.microcredits.match(/^(\d+)/);
          return match ? BigInt(match[1]) : 0n;
        });
        expect(amounts).toContain(600000n);
        expect(amounts).toContain(400000n);
      });

      it('should prefer an exact-match combination over one requiring change', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '100000u64.private' } },
          { spent: false, data: { microcredits: '200000u64.private' } },
          { spent: false, data: { microcredits: '800000u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act - need 900000
        const records = await walletService.getFeeRecords(900000n, mockAddress);

        // Assert - should select 800000 + 100000 = 900000 (exact, no change)
        expect(records.length).toBe(2);
        const totalAmount = records
          .map(r => JSON.parse(r))
          .reduce((sum, r) => {
            const match = r.data.microcredits.match(/^(\d+)/);
            return sum + (match ? BigInt(match[1]) : 0n);
          }, 0n);
        expect(totalAmount).toBe(900000n); // Exact match

        const amounts = records.map(r => {
          const parsed = JSON.parse(r);
          const match = parsed.data.microcredits.match(/^(\d+)/);
          return match ? BigInt(match[1]) : 0n;
        });
        expect(amounts).toContain(800000n);
        expect(amounts).toContain(100000n);
      });

      it('should accumulate multiple Records until the required amount is met', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '300000u64.private' } },
          { spent: false, data: { microcredits: '400000u64.private' } },
          { spent: false, data: { microcredits: '500000u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act - need 1M
        const records = await walletService.getFeeRecords(1000000n, mockAddress);

        // Assert - should select 500000 + 400000 + 300000
        expect(records.length).toBe(3);
        const totalAmount = records
          .map(r => JSON.parse(r))
          .reduce((sum, r) => {
            const match = r.data.microcredits.match(/^(\d+)/);
            return sum + (match ? BigInt(match[1]) : 0n);
          }, 0n);
        expect(totalAmount).toBe(1200000n);
      });

      it('should filter out spent Records', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: true, data: { microcredits: '5000000u64.private' } },  // Spent, ignore
          { spent: false, data: { microcredits: '600000u64.private' } },
          { spent: false, data: { microcredits: '500000u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act
        const records = await walletService.getFeeRecords(1000000n, mockAddress);

        // Assert
        expect(records.length).toBe(2);
        records.forEach(record => {
          const parsed = JSON.parse(record);
          expect(parsed.spent).toBe(false);
        });
      });
    });

    describe('Edge cases and error handling', () => {
      it('should correctly handle Records with 0 microcredits (ignore them)', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '0u64.private' } },
          { spent: false, data: { microcredits: '600000u64.private' } },
          { spent: false, data: { microcredits: '500000u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act
        const records = await walletService.getFeeRecords(1000000n, mockAddress);

        // Assert - should select 600000 + 500000 = 1100000, should not include the 0-amount record
        expect(records.length).toBe(2);
        const totalAmount = records
          .map(r => JSON.parse(r))
          .reduce((sum, r) => {
            const match = r.data.microcredits.match(/^(\d+)/);
            return sum + (match ? BigInt(match[1]) : 0n);
          }, 0n);
        expect(totalAmount).toBe(1100000n);

        // Verify no 0-amount record is included
        records.forEach(record => {
          const parsed = JSON.parse(record);
          const match = parsed.data.microcredits.match(/^(\d+)/);
          expect(match ? BigInt(match[1]) : 0n).toBeGreaterThan(0n);
        });
      });

      it('should throw an error when all Records have 0 amount', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '0u64.private' } },
          { spent: false, data: { microcredits: '0u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act & Assert
        await expect(walletService.getFeeRecords(1000000n, mockAddress)).rejects.toThrow('No unspent fee records available');
      });

      it('should handle Records missing the microcredits field', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: {} }, // Missing microcredits
          { spent: false, data: { microcredits: '1000000u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act
        const records = await walletService.getFeeRecords(500000n, mockAddress);

        // Assert - should select the 1000000 one
        expect(records.length).toBe(1);
        const parsed = JSON.parse(records[0]);
        expect(parsed.data.microcredits).toBe('1000000u64.private');
      });

      it('should throw an error when balance is insufficient', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '1000000u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act & Assert
        await expect(walletService.getFeeRecords(2000000n, mockAddress)).rejects.toThrow('Insufficient fee records');
      });

      it('should throw an error when no Records are available', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: [] });

        // Act & Assert
        await expect(walletService.getFeeRecords(1000000n, mockAddress)).rejects.toThrow('No unspent fee records available');
      });

      it('should throw an error when all Records are spent', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: true, data: { microcredits: '1000000u64.private' } },
          { spent: true, data: { microcredits: '2000000u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act & Assert
        await expect(walletService.getFeeRecords(1000000n, mockAddress)).rejects.toThrow('No unspent fee records available');
      });

      it('should throw an error when the wallet is not connected', async () => {
        // Arrange
        mockWallet.connected = false;

        // Act & Assert
        await expect(walletService.getFeeRecords(1000000n, '')).rejects.toThrow('Wallet not connected');
      });

      it('should throw an error when the wallet has no publicKey', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = undefined;

        // Act & Assert
        await expect(walletService.getFeeRecords(1000000n, '')).rejects.toThrow('Wallet not connected');
      });

      it('should throw an error when the wallet does not support requesting Records', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        mockWallet.requestRecords = undefined;
        mockWallet.requestRecordPlaintexts = undefined;
        const serviceWithoutRecords = new WalletService(mockWallet as any);

        // Act & Assert
        await expect(serviceWithoutRecords.getFeeRecords(1000000n, mockAddress)).rejects.toThrow('No fee records available');
      });

      it('should try requestRecordPlaintexts when requestRecords is unavailable', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        mockWallet.requestRecords = undefined;
        const mockRecords = [
          { spent: false, data: { microcredits: '2000000u64.private' } },
        ];
        mockWallet.requestRecordPlaintexts = vi.fn().mockResolvedValue({ records: mockRecords });
        const serviceWithPlaintexts = new WalletService(mockWallet as any);

        // Act
        const records = await serviceWithPlaintexts.getFeeRecords(1500000n, mockAddress);

        // Assert
        expect(records.length).toBe(1);
        expect(mockWallet.requestRecordPlaintexts).toHaveBeenCalledWith('credits.aleo');
      });

      it('should correctly handle requestRecords returning null', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        mockWallet.requestRecords = vi.fn().mockResolvedValue(null);

        // Act & Assert
        await expect(walletService.getFeeRecords(1000000n, mockAddress)).rejects.toThrow('No unspent fee records available');
      });

      it('should throw DECRYPTION_FAILED when requestRecords rejects (e.g. ViewKey decryption failure)', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        mockWallet.requestRecords = vi.fn().mockRejectedValue(new Error('Failed to decrypt records'));

        // Act & Assert
        const err = await walletService.getFeeRecords(1000000n, mockAddress).catch((e) => e);
        expect(err).toBeInstanceOf(WalletServiceError);
        expect((err as WalletServiceError).code).toBe(WalletError.DECRYPTION_FAILED);
        expect((err as WalletServiceError).message).toContain('Failed to get fee records');
      });
    });

    describe('Return format validation', () => {
      it('should return Records in string format', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '2000000u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act
        const records = await walletService.getFeeRecords(1500000n, mockAddress);

        // Assert
        records.forEach(record => {
          expect(typeof record).toBe('string');
        });
      });

      it('returned Records should be parseable as JSON', async () => {
        // Arrange
        mockWallet.connected = true;
        mockWallet.publicKey = mockAddress;
        const mockRecords = [
          { spent: false, data: { microcredits: '2000000u64.private' } },
        ];
        mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

        // Act
        const records = await walletService.getFeeRecords(1500000n, mockAddress);

        // Assert
        records.forEach(record => {
          expect(() => JSON.parse(record)).not.toThrow();
        });
      });
    });
  });

  describe('signMessage', () => {
    it('should successfully sign a message', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      const message = 'Test message to sign';
      const expectedSignature = 'signature_abcdef123456';
      mockWallet.signMessage = vi.fn().mockResolvedValue(expectedSignature);

      // Act
      const signature = await walletService.signMessage(message, mockAddress);

      // Assert
      expect(signature).toBe(expectedSignature);
      expect(mockWallet.signMessage).toHaveBeenCalledWith(message);
    });

    it('should throw an error when the wallet is not connected', async () => {
      // Arrange
      mockWallet.connected = false;

      // Act & Assert
      await expect(walletService.signMessage('test', '')).rejects.toThrow('Wallet not connected');
    });

    it('should throw an error when the message is empty', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;

      // Act & Assert
      await expect(walletService.signMessage('', mockAddress)).rejects.toThrow('Message cannot be empty');
      await expect(walletService.signMessage('   ', mockAddress)).rejects.toThrow('Message cannot be empty');
    });

    it('should throw an error when the wallet does not support signMessage', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.signMessage = undefined;
      const serviceWithoutSign = new WalletService(mockWallet as any);

      // Act & Assert
      await expect(serviceWithoutSign.signMessage('test', mockAddress)).rejects.toThrow(
        'Wallet does not support signMessage'
      );
    });

    it('should throw an error when the returned signature is empty', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.signMessage = vi.fn().mockResolvedValue('');

      // Act & Assert
      await expect(walletService.signMessage('test', mockAddress)).rejects.toThrow('Signature request returned empty result');
    });

    it('should throw a friendly error message when the user rejects the signature', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.signMessage = vi.fn().mockRejectedValue(new Error('User denied'));

      // Act & Assert
      await expect(walletService.signMessage('test', mockAddress)).rejects.toThrow('User rejected signature request');
    });
  });

  describe('requestTransaction', () => {
    beforeEach(() => {
      // Set up default requestTransaction mock
      mockWallet.requestTransaction = vi.fn().mockResolvedValue({
        transactionId: 'mock_transaction_id_123456'
      });
    });

    it('should successfully request a transaction', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      const functionName = 'create_invoice';
      const inputs = ['aleo1buyer123', '1000000u64', '1735689600u32', 'hash123', 'nonce456'];
      const mockResult = { transactionId: 'at1test123456' };
      mockWallet.requestTransaction = vi.fn().mockResolvedValue(mockResult);

      // Act
      const result = await walletService.requestTransaction({
        functionName,
        inputs,
        publicKey: mockAddress
      });

      // Assert
      expect(result).toEqual(mockResult);
      expect(mockWallet.requestTransaction).toHaveBeenCalledTimes(1);
      const callArgs = (mockWallet.requestTransaction as any).mock.calls[0][0];
      expect(callArgs.address).toBe(mockAddress);
      expect(callArgs.transitions[0].functionName).toBe(functionName);
      expect(callArgs.transitions[0].inputs).toEqual(inputs);
      expect(callArgs.transitions[0].program).toBe(PROGRAM_ID);
      expect(callArgs.fee).toBe(250_000);
      expect(callArgs.feePrivate).toBe(false);
    });

    it('should use a custom programId', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      const customProgramId = 'credits.aleo';
      const mockResult = { transactionId: 'at1test123456' };
      mockWallet.requestTransaction = vi.fn().mockResolvedValue(mockResult);

      // Act
      await walletService.requestTransaction({
        functionName: 'transfer_private',
        inputs: ['record123', 'aleo1recipient', '1000000u64'],
        publicKey: mockAddress,
        programId: customProgramId
      });

      // Assert
      const callArgs = (mockWallet.requestTransaction as any).mock.calls[0][0];
      expect(callArgs.transitions[0].program).toBe(customProgramId);
    });

    it('should use a custom fee amount', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      const customFee = 1_000_000;
      const mockResult = { transactionId: 'at1test123456' };
      mockWallet.requestTransaction = vi.fn().mockResolvedValue(mockResult);

      // Act
      await walletService.requestTransaction({
        functionName: 'create_invoice',
        inputs: ['input1'],
        publicKey: mockAddress,
        programId: PROGRAM_ID,
        fee: customFee
      });

      // Assert
      const callArgs = (mockWallet.requestTransaction as any).mock.calls[0][0];
      expect(callArgs.fee).toBe(customFee);
    });

    it('should use a custom chainId', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      const customChainId = 'mainnet';
      const mockResult = { transactionId: 'at1test123456' };
      mockWallet.requestTransaction = vi.fn().mockResolvedValue(mockResult);

      // Act
      await walletService.requestTransaction({
        functionName: 'create_invoice',
        inputs: ['input1'],
        publicKey: mockAddress,
        programId: PROGRAM_ID,
        fee: 250_000,
        chainId: customChainId
      });

      // Assert
      const callArgs = (mockWallet.requestTransaction as any).mock.calls[0][0];
      expect(callArgs.chainId).toBe(customChainId);
    });

    it('should throw an error when the wallet is not connected', async () => {
      // Arrange
      mockWallet.connected = false;

      // Act & Assert
      await expect(
        walletService.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: ''
        })
      ).rejects.toThrow('Wallet not connected');
    });

    it('should throw an error when the wallet does not exist', async () => {
      // Arrange
      const serviceWithoutWallet = new WalletService(null as any);

      // Act & Assert
      await expect(
        serviceWithoutWallet.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: mockAddress
        })
      ).rejects.toThrow('Wallet not found');
    });

    it('should throw an error when the wallet does not support requestTransaction', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.requestTransaction = undefined;
      const serviceWithoutRequestTx = new WalletService(mockWallet as any);

      // Act & Assert
      await expect(
        serviceWithoutRequestTx.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: mockAddress
        })
      ).rejects.toThrow('Wallet does not support requestTransaction');
    });

    it('should throw an error when the result is empty', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.requestTransaction = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(
        walletService.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: mockAddress
        })
      ).rejects.toThrow('Transaction request returned empty result');
    });

    it('should throw a friendly error message when the user rejects the transaction', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.requestTransaction = vi.fn().mockRejectedValue(new Error('User rejected the request'));

      // Act & Assert
      await expect(
        walletService.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: mockAddress
        })
      ).rejects.toThrow('User rejected the transaction request');
    });

    it('should throw a friendly error message when the user rejects the transaction (contains denied)', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.requestTransaction = vi.fn().mockRejectedValue(new Error('Request denied'));

      // Act & Assert
      await expect(
        walletService.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: mockAddress
        })
      ).rejects.toThrow('User rejected the transaction request');
    });

    it('should throw an error when there is a network mismatch', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.requestTransaction = vi.fn().mockRejectedValue(new Error('Network mismatch'));

      // Act & Assert
      await expect(
        walletService.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: mockAddress
        })
      ).rejects.toThrow('Wallet network does not match required network');
    });

    it('should throw a detailed error message for other errors', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      mockWallet.requestTransaction = vi.fn().mockRejectedValue(new Error('Transaction failed'));

      // Act & Assert
      await expect(
        walletService.requestTransaction({
          functionName: 'create_invoice',
          inputs: ['input1'],
          publicKey: mockAddress
        })
      ).rejects.toThrow('Failed to request transaction');
    });

    it('should correctly handle complex transactions with multiple inputs', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      const complexInputs = [
        'aleo1seller123',
        'aleo1buyer456',
        '1000000u64',
        '1735689600u32',
        'hash123field',
        'nonce456field'
      ];
      const mockResult = { transactionId: 'at1complex123' };
      mockWallet.requestTransaction = vi.fn().mockResolvedValue(mockResult);

      // Act
      const result = await walletService.requestTransaction({
        functionName: 'create_invoice',
        inputs: complexInputs,
        publicKey: mockAddress
      });

      // Assert
      expect(result).toEqual(mockResult);
      const callArgs = (mockWallet.requestTransaction as any).mock.calls[0][0];
      expect(callArgs.transitions[0].inputs).toEqual(complexInputs);
      expect(callArgs.transitions[0].inputs.length).toBe(6);
    });
  });

  describe('Integration test scenarios', () => {
    it('Full flow: connect -> sign message -> disconnect', async () => {
      // Arrange
      mockWallet.publicKey = undefined;
      mockWallet.connected = false;

      // Act - connect
      mockWallet.publicKey = mockAddress;
      mockWallet.connected = true;
      await walletService.connect();

      // Assert - connected
      expect(mockWallet.connected).toBe(true);

      // Act - sign message
      const signature = await walletService.signMessage('test message', mockAddress);
      expect(signature).toBeDefined();

      // Act - disconnect
      mockWallet.connected = false;
      await walletService.disconnect();
      expect(mockWallet.connected).toBe(false);
    });

    it('should correctly calculate balance in a complex scenario', async () => {
      // Arrange
      mockWallet.connected = true;
      mockWallet.publicKey = mockAddress;
      const mockRecords = [
        { spent: false, data: { microcredits: '1000000u64.private' } },
        { spent: true, data: { microcredits: '500000u64.private' } },  // Spent, not counted
        { spent: false, data: { microcredits: '2500000u64.private' } },
        { spent: false, data: {} }, // No microcredits, not counted
        { spent: false, data: { microcredits: '1500000u64.private' } },
      ];
      // Use requestRecords (higher priority)
      mockWallet.requestRecords = vi.fn().mockResolvedValue({ records: mockRecords });

      // Act
      const balances = await walletService.getPrivateBalance(mockAddress);

      // Assert
      // Only count unspent records with microcredits: 1000000 + 2500000 + 1500000 = 5000000
      expect(balances).toBe(5000000n);
    });
  });
});
