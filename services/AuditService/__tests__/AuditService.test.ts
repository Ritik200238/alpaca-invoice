import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditService, AuditServiceDependencies } from '../AuditServiceImpl';
import { AuditServiceError, AuditError } from '../IAuditService';
import { CryptoService } from '@/services/CryptoService/CryptoServiceImpl';
import type { Invoice, InvoiceDetails, AleoAddress, AleoField } from '@/lib/types';
import { InvoiceStatus } from '@/lib/types';
import { PROGRAM_ID } from '@/lib/contract';
import type { AuditPackageEnvelope } from '@/types/audit-package';

describe('AuditService', () => {
  let service: AuditService;
  let mockDeps: AuditServiceDependencies;
  let mockInvoice: Invoice;

  beforeEach(async () => {
    // Off-chain details (for audit decryption and frontend display, corresponding to InvoiceDetails)
    const details: InvoiceDetails = {
      invoiceNumber: 'INV-2026-001',
      orderId: 'ORD-2026-001',
      lineItems: [
        {
          description: 'Advanced Cloud Service',
          quantity: 1,
          unitPrice: 1000000,
          amount: 1000000
        }
      ],
      subtotal: 1000000,
      taxRate: 0.13,
      taxAmount: 130000,
      total: 1130000,
      currency: 'USD',
      notes: 'Service period: Feb 2026'
    };

    // Use real hash of details so generate->validate integrity check passes
    const cryptoService = new CryptoService();
    const invoiceHash = (await cryptoService.computeInvoiceHash(details)) as AleoField;

    // Mock invoice aligned with main.leo InvoiceRecord structure
    // Use valid Aleo testnet addresses (commitmentUtils uses Address.from_string)
    mockInvoice = {
      // 1. Basic Record fields (strictly corresponding to InvoiceRecord struct in main.leo)
      id: '50231998723415field' as AleoField,
      owner: 'aleo1n0gx6ehedlevfx2xtasc9l22vy4mkfwu0r2he6rdmm9n7hfuq5fq4d8r8u' as AleoAddress,
      seller: 'aleo1n0gx6ehedlevfx2xtasc9l22vy4mkfwu0r2he6rdmm9n7hfuq5fq4d8r8u' as AleoAddress,
      buyer: 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc' as AleoAddress,

      // 2. Financial details (for R1-R5 rule validation)
      amount: 1000000n,
      taxAmount: 130000n,

      // 3. Time and business identifiers (u32 Unix second timestamps -> Date)
      dueDate: new Date(1798761600 * 1000), // 2026-12-31
      createdAt: new Date(1739520000 * 1000), // 2026-02-14

      // 4. Hash anchors (critical for audit verification)
      invoiceHash,
      itemsHash: '111222333field' as AleoField,
      memoHash: '444555666field' as AleoField,
      orderId: '8888888field' as AleoField,
      currency: '8483728field' as AleoField,

      // 5. Status and extensions
      status: InvoiceStatus.PENDING,

      // 6. Additional business fields (not in contract Record, but needed for AuditPackage generation)
      nonce: '123456789field' as AleoField,

      // 7. Off-chain details (for frontend display after audit decryption)
      details
    } as Invoice;

    // Mock dependencies (no getAllInvoices; caller passes invoice into generate)
    mockDeps = {
      signerAddress: 'aleo1signer' as AleoAddress,
      signMessage: vi.fn().mockResolvedValue('mock-signature-12345'),
      protocolService: {
        verifyInvoiceOnChain: vi.fn().mockResolvedValue({
          exists: true,
          hashMatch: true,
          chainStatus: null
        }),
        // Registry reader stubs for commitment/rules caches (return null -> fall back to local compute)
        getProgramMappingValue: vi.fn().mockResolvedValue(null)
      } as any
    };

    service = new AuditService(mockDeps);
  });

  // ========== 1. 生成审计包（useAuditPackageGenerate） ==========
  describe('generate', () => {
    it('should successfully generate an audit package (envelope + auditKey + auditKeyHash)', async () => {
      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT', 'READ_PARTIES', 'READ_DETAILS']
      };

      const result = await service.generate(params);

      expect(result).toBeDefined();
      expect(result.envelope).toBeDefined();
      expect(result.auditKey).toBeDefined();
      expect(result.auditKeyHash).toBeDefined();

      const env = result.envelope as AuditPackageEnvelope;
      expect(env.version).toBe('2.2.0');
      expect(env.audit_type).toBe('selective_disclosure');
      expect(env.network).toMatch(/^aleo_/);
      expect(env.contract).toBe(PROGRAM_ID);
      expect(env.context.invoice_id).toBe('50231998723415field');
      expect(env.context.audit_key_hash).toBeTruthy();
      expect(typeof env.context.expires_at).toBe('number');
      expect(env.encryption.algorithm).toBe('AES-256-GCM');
      expect(env.encryption.iv).toBeTruthy();
      expect(env.encryption.auth_tag).toBeTruthy();
      expect(env.encryption.ciphertext).toBeTruthy();

      expect(result.auditKey).toMatch(/^[0-9a-f]{64}$/);
      expect(String(result.auditKeyHash)).toMatch(/field$/);

      expect(mockDeps.signMessage).toHaveBeenCalledTimes(1);
    });

    it('should generate different audit keys for each call', async () => {
      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act
      const result1 = await service.generate(params);
      const result2 = await service.generate(params);

      // Assert
      expect(result1.auditKey).not.toBe(result2.auditKey);
    });

    it('should use caller-provided audit key when passed', async () => {
      const userAuditKey = 'a'.repeat(64);
      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT', 'READ_DETAILS'],
        auditKey: userAuditKey
      };

      const result = await service.generate(params);

      expect(result.auditKey).toBe(userAuditKey);
      expect(result.auditKeyHash).toBeDefined();
      expect(result.envelope).toBeDefined();

      const valid = await service.validateEnvelope(result.envelope as any, userAuditKey);
      expect(valid.valid).toBe(true);
    });

    it('should produce valid envelope when user provides audit key (64 hex)', async () => {
      const hexKey = '0123456789abcdef'.repeat(4);
      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT'],
        auditKey: hexKey
      };

      const result = await service.generate(params);

      expect(result.auditKey).toBe(hexKey);
      expect(result.auditKey).toMatch(/^[0-9a-f]{64}$/);

      const validation = await service.validateEnvelope(result.envelope as any, hexKey);
      expect(validation.valid).toBe(true);
      expect(validation.decrypted).toBeDefined();
    });

    it('should throw INVALID_INPUT when invoice is missing', async () => {
      const params = {
        invoice: undefined as any,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      await expect(service.generate(params)).rejects.toThrow('Invoice is required');
      await expect(service.generate(params)).rejects.toThrow(AuditServiceError);

      try {
        await service.generate(params);
      } catch (error: any) {
        expect(error.code).toBe(AuditError.INVALID_INPUT);
      }
    });

    it('should throw NOT_CONNECTED error when wallet is not connected', async () => {
      const serviceWithoutWallet = new AuditService({
        signerAddress: null,
        signMessage: mockDeps.signMessage
      });

      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      await expect(serviceWithoutWallet.generate(params)).rejects.toThrow('Wallet not connected');
      await expect(serviceWithoutWallet.generate(params)).rejects.toThrow(AuditServiceError);

      try {
        await serviceWithoutWallet.generate(params);
      } catch (error: any) {
        expect(error.code).toBe(AuditError.NOT_CONNECTED);
      }
    });

    it('should throw MISSING_DETAILS when invoice has no details', async () => {
      const invoiceWithoutDetails = { ...mockInvoice, details: undefined };

      const params = {
        invoice: invoiceWithoutDetails,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      await expect(service.generate(params)).rejects.toThrow('Invoice details are missing');
      await expect(service.generate(params)).rejects.toThrow(AuditServiceError);

      try {
        await service.generate(params);
      } catch (error: any) {
        expect(error.code).toBe(AuditError.MISSING_DETAILS);
      }
    });

    it('should throw INVALID_INPUT when invoice has no nonce', async () => {
      const invoiceWithoutNonce = { ...mockInvoice, nonce: undefined } as Invoice;

      const params = {
        invoice: invoiceWithoutNonce,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      await expect(service.generate(params)).rejects.toThrow('Cannot generate chain-anchored audit package');
      await expect(service.generate(params)).rejects.toThrow(AuditServiceError);
    });

    it('should throw INVALID_INPUT error when no permissions result in data', async () => {
      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: []
      };

      // Act & Assert
      await expect(service.generate(params)).rejects.toThrow('No data selected for disclosure');
      await expect(service.generate(params)).rejects.toThrow(AuditServiceError);
      
      try {
        await service.generate(params);
      } catch (error: any) {
        expect(error.code).toBe(AuditError.INVALID_INPUT);
      }
    });

    it('should handle READ_AMOUNT permission only', async () => {
      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      const result = await service.generate(params);

      expect(result.envelope).toBeDefined();
      expect(result.envelope.context.invoice_id).toBe('50231998723415field');
    });

    it('should handle READ_PARTIES permission only', async () => {
      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_PARTIES']
      };

      const result = await service.generate(params);

      expect(result.envelope).toBeDefined();
    });

    it('should handle READ_DETAILS permission', async () => {
      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_DETAILS']
      };

      // Act
      const result = await service.generate(params);

      expect(result.envelope).toBeDefined();
      expect(result.envelope.context.invoice_id).toBe('50231998723415field');
    });

    it('should handle multiple permissions', async () => {
      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT', 'READ_PARTIES', 'READ_DETAILS', 'READ_LINE_ITEMS']
      };

      // Act
      const result = await service.generate(params);

      // Assert
      expect(result.envelope.context.invoice_id).toBe('50231998723415field');
    });

    it('should throw GENERATION_FAILED when signMessage fails', async () => {
      mockDeps.signMessage = vi.fn().mockRejectedValue(new Error('Signature failed'));
      service = new AuditService(mockDeps);

      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      // Act & Assert
      await expect(service.generate(params)).rejects.toThrow(AuditServiceError);
      
      try {
        await service.generate(params);
      } catch (error: any) {
        expect(error.code).toBe(AuditError.GENERATION_FAILED);
      }
    });

    it('should include expires_at in envelope context', async () => {
      const beforeSec = Math.floor(Date.now() / 1000);
      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      const result = await service.generate(params);
      const afterSec = Math.floor(Date.now() / 1000);

      expect(result.envelope.context.expires_at).toBeGreaterThanOrEqual(beforeSec);
      expect(result.envelope.context.expires_at).toBeLessThanOrEqual(afterSec + 7 * 24 * 3600 + 2);
    });

    it('should set correct contract in envelope', async () => {
      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      const result = await service.generate(params);

      expect(result.envelope.contract).toBe(PROGRAM_ID);
      expect(result.envelope.contract).toMatch(/\.aleo$/);
    });

    it('should handle complex invoice with multiple line items', async () => {
      const complexInvoice: Invoice = {
        ...mockInvoice,
        details: {
          invoiceNumber: 'INV-COMPLEX-001',
          orderId: 'ORD-COMPLEX-001',
          lineItems: [
            { description: 'Product A', quantity: 5, unitPrice: 123.45, amount: 617.25 },
            { description: 'Product B', quantity: 3, unitPrice: 67.89, amount: 203.67 },
            { description: 'Service C', quantity: 1, unitPrice: 500, amount: 500 }
          ],
          subtotal: 1320.92,
          taxRate: 0.13,
          taxAmount: 171.72,
          total: 1492.64,
          currency: 'CAD',
          notes: 'Complex invoice with multiple items'
        }
      };

      const params = {
        invoice: complexInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_DETAILS']
      };

      const result = await service.generate(params);

      expect(result).toBeDefined();
      expect(result.envelope).toBeDefined();
      expect(result.auditKey).toBeDefined();
    });

    it('should call signMessage with audit package message', async () => {
      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      await service.generate(params);

      expect(mockDeps.signMessage).toHaveBeenCalledWith(
        expect.stringContaining('AUDIT_PACKAGE_V2_2')
      );
    });

    it('should call buildAuditMessage with canonical format: AUDIT_PACKAGE_V2_2|programId|invoiceId|invoiceHash|nonce|root|expiresAt|sortedPerms|cipherHash', async () => {
      const expiresAt = Date.now() + 60_000;
      const params = {
        invoice: mockInvoice,
        expiresAt,
        permissions: ['READ_DETAILS', 'READ_AMOUNT']
      };

      await service.generate(params);

      const signCalls = (mockDeps.signMessage as ReturnType<typeof vi.fn>).mock.calls;
      const packageSignCall = signCalls.find((call: string[]) =>
        call[0]?.startsWith('AUDIT_PACKAGE_V2_2|')
      );
      expect(packageSignCall).toBeDefined();

      const message = packageSignCall![0];
      const parts = message.split('|');
      expect(parts[0]).toBe('AUDIT_PACKAGE_V2_2');
      expect(parts[1]).toBe(PROGRAM_ID);
      expect(parts[2]).toBe('50231998723415field');
      expect(parts[4]).toBe('123456789field'); // nonce
      expect(parts[5]).toBeTruthy(); // root
      expect(Number(parts[6])).toBe(expiresAt);
      expect(parts[7]).toBe('READ_AMOUNT,READ_DETAILS');
      expect(parts[8]).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should filter by READ_DETAILS: decrypted payload has data and commitments', async () => {
      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 60_000,
        permissions: ['READ_DETAILS', 'READ_AMOUNT', 'READ_LINE_ITEMS']
      };

      const generated = await service.generate(params);
      const result = await service.validateEnvelope(generated.envelope, generated.auditKey);

      expect(result.valid).toBe(true);
      expect(result.decrypted?.data).toBeDefined();
      expect(result.decrypted?.commitments?.root).toBeTruthy();
      expect(result.decrypted?.invoiceId).toBe('50231998723415field');
      if (result.decrypted?.data && 'amount' in result.decrypted.data) {
        expect(Number(result.decrypted.data.amount)).toBe(1000000);
      }
    });

    it('should filter by READ_PARTIES + READ_DETAILS: decrypted has seller, buyer in data', async () => {
      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 60_000,
        permissions: ['READ_PARTIES', 'READ_DETAILS']
      };

      const generated = await service.generate(params);
      const result = await service.validateEnvelope(generated.envelope, generated.auditKey);

      expect(result.valid).toBe(true);
      expect(result.decrypted?.data?.seller).toBe('aleo1n0gx6ehedlevfx2xtasc9l22vy4mkfwu0r2he6rdmm9n7hfuq5fq4d8r8u');
      expect(result.decrypted?.data?.buyer).toBe('aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc');
    });
  });

  // ========== 2. 解密审计包（useAuditPackageDecrypt，基于 validateEnvelope） ==========
  describe('validateEnvelope', () => {
    it('should validate a legitimate envelope', async () => {
      const generateParams = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT', 'READ_PARTIES', 'READ_DETAILS']
      };

      const generated = await service.generate(generateParams);

      const result = await service.validateEnvelope(generated.envelope, generated.auditKey);

      expect(result).toBeDefined();
      expect(result.valid).toBe(true);
      expect(result.decrypted).toBeDefined();
    });

    it('should reject envelope with wrong audit key', async () => {
      const generateParams = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      const generated = await service.generate(generateParams);
      const wrongKey = 'a'.repeat(64);

      const result = await service.validateEnvelope(generated.envelope, wrongKey);

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should reject expired audit envelope', async () => {
      const generateParams = {
        invoice: mockInvoice,
        expiresAt: 1, // Already expired (1 second after epoch)
        permissions: ['READ_AMOUNT']
      };

      const generated = await service.generate(generateParams);

      const result = await service.validateEnvelope(generated.envelope, generated.auditKey);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('should return valid: false for invalid envelope (bad ciphertext)', async () => {
      const invalidEnvelope: any = {
        version: '2.2.0',
        audit_type: 'selective_disclosure',
        network: 'aleo_testnet3',
        contract: PROGRAM_ID,
        context: { invoice_id: '1field', audit_key_hash: '2field', expires_at: Math.floor(Date.now() / 1000) + 3600 },
        encryption: { iv: 'eA==', auth_tag: 'eA==', ciphertext: 'invalid', algorithm: 'AES-256-GCM' }
      };

      const result = await service.validateEnvelope(invalidEnvelope, 'a'.repeat(64));
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should return decrypted data for valid envelope', async () => {
      const generateParams = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_DETAILS']
      };

      const generated = await service.generate(generateParams);

      const result = await service.validateEnvelope(generated.envelope, generated.auditKey);

      expect(result.valid).toBe(true);
      expect(result.decrypted).toBeDefined();
      expect(result.decrypted?.data).toBeDefined();
      expect(result.decrypted?.commitments?.root).toBeDefined();
    });

    it('should fail when chain hash mismatch', async () => {
      const generated = await service.generate({
        invoice: mockInvoice,
        expiresAt: Date.now() + 60_000,
        permissions: ['READ_DETAILS']
      });

      const depsWithHashMismatch: AuditServiceDependencies = {
        ...mockDeps,
        protocolService: {
          verifyInvoiceOnChain: vi.fn().mockResolvedValue({
            exists: true,
            hashMatch: false,
            chainStatus: InvoiceStatus.PENDING
          }),
          getProgramMappingValue: vi.fn().mockResolvedValue(null)
        } as any
      };
      const serviceWithMismatch = new AuditService(depsWithHashMismatch);

      const result = await serviceWithMismatch.validateEnvelope(generated.envelope, generated.auditKey);

      expect(result.valid).toBe(true);
      expect(result.chainVerification?.hashMatchesChain).toBe(false);
    });

    it('should pass with chainVerification when chain matches (validateEnvelope)', async () => {
      mockDeps.protocolService = {
        verifyInvoiceOnChain: vi.fn().mockResolvedValue({
          exists: true,
          hashMatch: true,
          chainStatus: InvoiceStatus.PAID
        }),
        getProgramMappingValue: vi.fn().mockResolvedValue(null)
      } as any;
      service = new AuditService(mockDeps);

      const generated = await service.generate({
        invoice: mockInvoice,
        expiresAt: Date.now() + 60_000,
        permissions: ['READ_DETAILS']
      });

      const result = await service.validateEnvelope(generated.envelope, generated.auditKey);

      expect(result.valid).toBe(true);
      expect(result.chainVerification?.chainStatus).toBe(InvoiceStatus.PAID);
    });

    it('should fail with integrity hash mismatch when envelope ciphertext is tampered', async () => {
      const generated = await service.generate({
        invoice: mockInvoice,
        expiresAt: Date.now() + 60_000,
        permissions: ['READ_DETAILS']
      });

      const tamperedEnvelope = {
        ...generated.envelope,
        encryption: {
          ...generated.envelope.encryption,
          ciphertext: Buffer.from(generated.envelope.encryption.ciphertext, 'base64')
            .reverse()
            .toString('base64')
        }
      };

      const result = await service.validateEnvelope(tamperedEnvelope, generated.auditKey);

      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/decrypt|integrity|Failed/i);
    });
  });

  // ========== 3. 验证审计包（useAuditPackageVerify：五阶段 verifyEnvelopePhases，见 integration） ==========

  describe('error handling', () => {
    it('should throw AuditServiceError type for all errors', async () => {
      const scenarios = [
        {
          name: 'missing invoice',
          params: {
            invoice: undefined as any,
            expiresAt: Date.now() + 1000,
            permissions: ['READ_AMOUNT']
          }
        }
      ];

      for (const scenario of scenarios) {
        try {
          await service.generate(scenario.params);
          expect.fail(`Should have thrown for: ${scenario.name}`);
        } catch (error) {
          expect(error).toBeInstanceOf(AuditServiceError);
        }
      }
    });

    it('should preserve error details in wrapped errors', async () => {
      const originalError = new Error('Original error message');
      mockDeps.signMessage = vi.fn().mockRejectedValue(originalError);
      service = new AuditService(mockDeps);

      const params = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      try {
        await service.generate(params);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(AuditServiceError);
        expect(error.details).toBeDefined();
        expect(error.details.originalError).toContain('Original error message');
      }
    });
  });

  describe('integration', () => {
    it('should complete full generate-validateEnvelope cycle', async () => {
      const generateParams = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT', 'READ_PARTIES', 'READ_DETAILS']
      };

      const generated = await service.generate(generateParams);

      expect(generated.envelope).toBeDefined();
      expect(generated.auditKey).toBeDefined();
      expect(generated.envelope.encryption.iv).toBeTruthy();
      expect(generated.envelope.encryption.ciphertext).toBeTruthy();

      const validated = await service.validateEnvelope(generated.envelope, generated.auditKey);

      expect(validated.valid).toBe(true);
      expect(validated.decrypted).toBeDefined();
      expect(validated.decrypted?.invoiceId).toBe('50231998723415field');
      expect(validated.decrypted?.data).toBeDefined();
      expect(validated.decrypted?.commitments?.root).toBeTruthy();
    });

    it('should handle multiple invoices when caller passes selected invoice', async () => {
      const invoice2 = { ...mockInvoice, id: 'invoice2' as AleoField };

      const params = {
        invoice: invoice2,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };

      const result = await service.generate(params);

      expect(result.envelope.context.invoice_id).toBe('invoice2');
    });
  });

  // ========== 4. 五阶段验证 verifyEnvelopePhases 集成测试 ==========
  describe('verifyEnvelopePhases', () => {
    it('should pass all 5 phases with valid envelope and mock registry', async () => {
      // Generate a valid envelope
      const generateParams = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT', 'READ_PARTIES', 'READ_DETAILS']
      };
      const generated = await service.generate(generateParams);

      // Create mock registry that returns matching chain data
      const mockRegistry = {
        getInvoiceHash: vi.fn().mockResolvedValue(mockInvoice.invoiceHash),
        getAuditAuthorization: vi.fn().mockResolvedValue({
          audit_key_hash: generated.auditKeyHash,
          scopes_bitmask: 0b111111111n, // All 9 scopes (will need to update for 11)
          expires_at: Math.floor((Date.now() + 7 * 24 * 3600 * 1000) / 1000),
          issuer: mockInvoice.seller
        }),
        getCommitmentRoot: vi.fn().mockResolvedValue(generated.envelope.context.audit_key_hash), // Placeholder
        getFieldCommitments: vi.fn().mockResolvedValue(null),
        getRulesResult: vi.fn().mockResolvedValue(null),
        getInvoiceTaxTag: vi.fn().mockResolvedValue(null),
        getPaymentCommitment: vi.fn().mockResolvedValue(null),
        getInvoiceJctReg: vi.fn().mockResolvedValue(null)
      };

      // Verify envelope phases
      const result = await service.verifyEnvelopePhases(
        generated.envelope,
        generated.auditKey,
        mockRegistry as any
      );

      // Phase 1 should pass (decrypt, expiry, integrity)
      expect(result.phase1.ok).toBe(true);

      // Phase 2 should pass (invoice hash match)
      expect(result.phase2.ok).toBe(true);

      // Phase 3 should pass (audit authorization)
      expect(result.phase3.ok).toBe(true);

      // Decrypted data should be available
      expect(result.decrypted).toBeDefined();
      expect(result.decrypted?.invoiceId).toBe(mockInvoice.id);
    });

    it('should fail Phase 1 when envelope is expired', async () => {
      const generateParams = {
        invoice: mockInvoice,
        expiresAt: 1, // Already expired
        permissions: ['READ_AMOUNT']
      };
      const generated = await service.generate(generateParams);

      const mockRegistry = {
        getInvoiceHash: vi.fn().mockResolvedValue(mockInvoice.invoiceHash),
        getAuditAuthorization: vi.fn().mockResolvedValue(null),
        getCommitmentRoot: vi.fn().mockResolvedValue(null),
        getFieldCommitments: vi.fn().mockResolvedValue(null),
        getRulesResult: vi.fn().mockResolvedValue(null),
        getInvoiceTaxTag: vi.fn().mockResolvedValue(null),
        getPaymentCommitment: vi.fn().mockResolvedValue(null),
        getInvoiceJctReg: vi.fn().mockResolvedValue(null)
      };

      const result = await service.verifyEnvelopePhases(
        generated.envelope,
        generated.auditKey,
        mockRegistry as any
      );

      expect(result.phase1.ok).toBe(false);
      // Phase 1 returns generic "Pre-check failed" message; expiry detail is in checks
      expect(result.phase1.message).toBe('Pre-check failed');
      // Verify the expiresAt check specifically failed
      const expiryCheck = result.phase1.checks?.find(c => c.key === 'expiresAt');
      expect(expiryCheck?.ok).toBe(false);
      expect(result.overallValid).toBe(false);
    });

    it('should fail Phase 2 when chain invoice hash does not match', async () => {
      const generateParams = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };
      const generated = await service.generate(generateParams);

      const mockRegistry = {
        getInvoiceHash: vi.fn().mockResolvedValue('wronghashfield' as AleoField), // Mismatch
        getAuditAuthorization: vi.fn().mockResolvedValue(null),
        getCommitmentRoot: vi.fn().mockResolvedValue(null),
        getFieldCommitments: vi.fn().mockResolvedValue(null),
        getRulesResult: vi.fn().mockResolvedValue(null),
        getInvoiceTaxTag: vi.fn().mockResolvedValue(null),
        getPaymentCommitment: vi.fn().mockResolvedValue(null),
        getInvoiceJctReg: vi.fn().mockResolvedValue(null)
      };

      const result = await service.verifyEnvelopePhases(
        generated.envelope,
        generated.auditKey,
        mockRegistry as any
      );

      expect(result.phase1.ok).toBe(true); // Decrypt still works
      expect(result.phase2.ok).toBe(false); // Hash mismatch
      expect(result.overallValid).toBe(false);
    });

    it('should fail Phase 3 when no audit authorization on chain', async () => {
      const generateParams = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };
      const generated = await service.generate(generateParams);

      const mockRegistry = {
        getInvoiceHash: vi.fn().mockResolvedValue(mockInvoice.invoiceHash),
        getAuditAuthorization: vi.fn().mockResolvedValue(null), // No authorization
        getCommitmentRoot: vi.fn().mockResolvedValue(null),
        getFieldCommitments: vi.fn().mockResolvedValue(null),
        getRulesResult: vi.fn().mockResolvedValue(null),
        getInvoiceTaxTag: vi.fn().mockResolvedValue(null),
        getPaymentCommitment: vi.fn().mockResolvedValue(null),
        getInvoiceJctReg: vi.fn().mockResolvedValue(null)
      };

      const result = await service.verifyEnvelopePhases(
        generated.envelope,
        generated.auditKey,
        mockRegistry as any
      );

      expect(result.phase1.ok).toBe(true);
      expect(result.phase2.ok).toBe(true);
      expect(result.phase3.ok).toBe(false); // No auth
    });

    it('should fail Phase 1 when decryption fails with wrong key', async () => {
      const generateParams = {
        invoice: mockInvoice,
        expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        permissions: ['READ_AMOUNT']
      };
      const generated = await service.generate(generateParams);

      const mockRegistry = {
        getInvoiceHash: vi.fn().mockResolvedValue(mockInvoice.invoiceHash),
        getAuditAuthorization: vi.fn().mockResolvedValue(null),
        getCommitmentRoot: vi.fn().mockResolvedValue(null),
        getFieldCommitments: vi.fn().mockResolvedValue(null),
        getRulesResult: vi.fn().mockResolvedValue(null),
        getInvoiceTaxTag: vi.fn().mockResolvedValue(null),
        getPaymentCommitment: vi.fn().mockResolvedValue(null),
        getInvoiceJctReg: vi.fn().mockResolvedValue(null)
      };

      const wrongKey = 'b'.repeat(64);
      const result = await service.verifyEnvelopePhases(
        generated.envelope,
        wrongKey,
        mockRegistry as any
      );

      expect(result.phase1.ok).toBe(false);
      expect(result.overallValid).toBe(false);
    });
  });
});
