import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditService, AuditServiceDependencies } from '../AuditServiceImpl';
import type { AleoAddress, AleoField, TaxGroups } from '@/lib/types';
import type { AuditPackageEnvelopeV3 } from '@/types/audit-package';
import type { IAleoProtocolService } from '@/services/AleoProtocolService/IAleoProtocolService';
import type { ICryptoService } from '@/services/CryptoService/ICryptoService';
import type { IInvoiceRegistryService } from '@/services/InvoiceRegistryService/IInvoiceRegistryService';

/**
 * Wave 3 (V3) Audit Package Verification Tests
 *
 * Tests the 3-step verification pipeline:
 * - Step 1: Identity (JCT Registration / T-Number)
 * - Step 2: Money Flow (Payment verification via settlement_anchor)
 * - Step 3: Tax Check (TaxGroups verification A/B/C)
 */
describe('AuditService.verifyV3', () => {
  let service: AuditService;
  let mockDeps: AuditServiceDependencies;
  let mockProtocol: IAleoProtocolService;
  let mockCrypto: ICryptoService;
  let mockRegistry: IInvoiceRegistryService;

  // Sample V3 envelope structure
  const createMockEnvelopeV3 = (overrides?: Partial<AuditPackageEnvelopeV3>): AuditPackageEnvelopeV3 => ({
    version: '3.0.0',
    audit_type: 'selective_disclosure',
    role: 'seller',
    network: 'aleo_testnet3',
    contract: 'zk_invoice_v3_1.aleo',
    context: {
      invoice_ids: ['123456field' as AleoField],
      audit_key_hash: 'audit_key_hash_field' as AleoField,
      expires_at: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
    },
    encryption: {
      algorithm: 'AES-256-GCM',
      iv: 'base64iv==',
      auth_tag: 'base64tag==',
      ciphertext: 'base64ciphertext=='
    },
    jct_registration_hint: '1234567890123',
    ...overrides
  });

  const sampleTaxGroups: TaxGroups = {
    group_a: { rate_bps: 1000n, net_sum: 10000000n, tax_sum: 1000000n }, // 10%
    group_b: { rate_bps: 800n, net_sum: 5000000n, tax_sum: 400000n }    // 8%
  };

  beforeEach(() => {
    mockDeps = {
      signerAddress: 'aleo1seller123' as AleoAddress,
      signMessage: vi.fn().mockResolvedValue('mock-signature')
    };

    mockProtocol = {
      getLatestBlockHeight: vi.fn().mockResolvedValue(1000),
      getProgramMappingValue: vi.fn().mockResolvedValue(null)
    } as unknown as IAleoProtocolService;

    mockCrypto = {
      auditKeyToBytes: vi.fn().mockReturnValue(new Uint8Array(32).fill(0xaa)),
      decryptWithRawKey: vi.fn().mockResolvedValue({
        invoiceId: '123456field',
        data: { amount: 15400000 },
        tax_groups: sampleTaxGroups
      }),
      hashTNumber: vi.fn().mockResolvedValue('jct_hash_field' as AleoField),
      verifyTaxTag: vi.fn().mockResolvedValue({
        allPassed: true,
        a: { ok: true, detail: 'Tax calculation correct' },
        b: { ok: true, detail: 'BHP256 hash matches' },
        c: { ok: true, detail: 'Total amount matches' }
      })
    } as unknown as ICryptoService;

    mockRegistry = {
      getInvoiceHash: vi.fn().mockResolvedValue('invoice_hash_field' as AleoField),
      getInvoiceJctReg: vi.fn().mockResolvedValue('jct_hash_field' as AleoField),
      getInvoiceTaxTag: vi.fn().mockResolvedValue('tax_tag_field' as AleoField),
      getPaymentCommitment: vi.fn().mockResolvedValue('123456field' as AleoField),
      getAuditAuthorization: vi.fn().mockResolvedValue(null),
      getCommitmentRoot: vi.fn().mockResolvedValue(null),
      getFieldCommitments: vi.fn().mockResolvedValue(null),
      getRulesResult: vi.fn().mockResolvedValue(null)
    } as unknown as IInvoiceRegistryService;

    service = new AuditService(mockDeps);
  });

  describe('Step 1: Identity (JCT Registration)', () => {
    it('should pass when T-number hash matches chain jct_registration', async () => {
      const envelope = createMockEnvelopeV3({
        jct_registration_hint: '1234567890123'
      });
      const auditKey = 'a'.repeat(64);

      const result = await service.verifyV3(envelope, auditKey, {
        protocol: mockProtocol,
        crypto: mockCrypto,
        registry: mockRegistry
      });

      expect(result.step1Identity.ok).toBe(true);
      expect(result.step1Identity.tNumber).toBe('1234567890123');
    });

    it('should fail when T-number hash does not match chain', async () => {
      (mockRegistry.getInvoiceJctReg as any).mockResolvedValue('different_hash_field' as AleoField);

      const envelope = createMockEnvelopeV3({
        jct_registration_hint: '1234567890123'
      });
      const auditKey = 'a'.repeat(64);

      const result = await service.verifyV3(envelope, auditKey, {
        protocol: mockProtocol,
        crypto: mockCrypto,
        registry: mockRegistry
      });

      expect(result.step1Identity.ok).toBe(false);
      expect(result.step1Identity.hashMatch).toBe(false);
    });

    it('should skip identity check when no jct_registration_hint', async () => {
      const envelope = createMockEnvelopeV3({
        jct_registration_hint: undefined
      });
      const auditKey = 'a'.repeat(64);

      const result = await service.verifyV3(envelope, auditKey, {
        protocol: mockProtocol,
        crypto: mockCrypto,
        registry: mockRegistry
      });

      // Should still be ok (skipped, not failed)
      expect(result.step1Identity.ok).toBe(true);
    });
  });

  describe('Step 2: Money Flow (Payment Verification)', () => {
    it('should pass for buyer role when settlement_anchor maps to invoice_id', async () => {
      const envelope = createMockEnvelopeV3({
        role: 'buyer'
      });

      // Decrypt returns settlement_anchor
      (mockCrypto.decryptWithRawKey as any).mockResolvedValue({
        invoiceId: '123456field',
        settlementAnchor: 'settlement_anchor_field',
        data: { amount: 15400000 }
      });

      // Registry returns matching invoice_id from settlement_anchor
      (mockRegistry.getPaymentCommitment as any).mockResolvedValue('123456field' as AleoField);

      const auditKey = 'a'.repeat(64);
      const result = await service.verifyV3(envelope, auditKey, {
        protocol: mockProtocol,
        crypto: mockCrypto,
        registry: mockRegistry
      });

      expect(result.step2MoneyFlow.ok).toBe(true);
    });

    it('should skip money flow check for seller role', async () => {
      const envelope = createMockEnvelopeV3({
        role: 'seller'
      });
      const auditKey = 'a'.repeat(64);

      const result = await service.verifyV3(envelope, auditKey, {
        protocol: mockProtocol,
        crypto: mockCrypto,
        registry: mockRegistry
      });

      expect(result.step2MoneyFlow.ok).toBe(true);
      expect(result.step2MoneyFlow.message).toMatch(/seller|skipped/i);
    });

    it('should fail when settlement_anchor does not map to expected invoice_id', async () => {
      const envelope = createMockEnvelopeV3({
        role: 'buyer'
      });

      // Use snake_case as the actual code checks for settlement_anchor
      (mockCrypto.decryptWithRawKey as any).mockResolvedValue({
        invoiceId: '123456field',
        settlement_anchor: 'settlement_anchor_field',
        data: { amount: 15400000 }
      });

      // Registry returns different invoice_id that doesn't match envelope.context.invoice_ids
      (mockRegistry.getPaymentCommitment as any).mockResolvedValue('wrong_invoice_field' as AleoField);

      const auditKey = 'a'.repeat(64);
      const result = await service.verifyV3(envelope, auditKey, {
        protocol: mockProtocol,
        crypto: mockCrypto,
        registry: mockRegistry
      });

      expect(result.step2MoneyFlow.ok).toBe(false);
    });
  });

  describe('Step 3: Tax Check (JCT Compliance)', () => {
    it('should pass when all 3 tax verifications pass (A/B/C)', async () => {
      const envelope = createMockEnvelopeV3({
        role: 'seller',
        encryption: {
          algorithm: 'AES-256-GCM',
          iv: 'base64iv==',
          auth_tag: 'base64tag==',
          ciphertext: 'base64ciphertext==',
          tax_groups_ciphertext: 'encrypted_tax_groups',
          tax_groups_iv: 'tax_iv',
          tax_groups_auth_tag: 'tax_tag'
        }
      });

      // Mock decryptWithRawKey to return tax_groups on second call
      let callCount = 0;
      (mockCrypto.decryptWithRawKey as any).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call: main payload
          return { invoiceId: '123456field', data: { amount: 15400000 } };
        } else {
          // Second call: tax_groups
          return sampleTaxGroups;
        }
      });

      // Ensure registry returns a tax tag
      (mockRegistry.getInvoiceTaxTag as any).mockResolvedValue('tax_tag_field' as AleoField);

      const auditKey = 'a'.repeat(64);
      const result = await service.verifyV3(envelope, auditKey, {
        protocol: mockProtocol,
        crypto: mockCrypto,
        registry: mockRegistry
      });

      expect(result.step3TaxCheck.ok).toBe(true);
      expect(result.step3TaxCheck.verificationA?.ok).toBe(true);
      expect(result.step3TaxCheck.verificationB?.ok).toBe(true);
      expect(result.step3TaxCheck.verificationC?.ok).toBe(true);
    });

    it('should fail when tax calculation is wrong (verification A)', async () => {
      (mockCrypto.verifyTaxTag as any).mockResolvedValue({
        allPassed: false,
        a: { ok: false, detail: 'Tax calculation mismatch' },
        b: { ok: true },
        c: { ok: true }
      });

      const envelope = createMockEnvelopeV3({
        encryption: {
          algorithm: 'AES-256-GCM',
          iv: 'base64iv==',
          auth_tag: 'base64tag==',
          ciphertext: 'base64ciphertext==',
          tax_groups_ciphertext: 'encrypted_tax_groups',
          tax_groups_iv: 'tax_iv',
          tax_groups_auth_tag: 'tax_tag'
        }
      });

      // Mock decryptWithRawKey for both calls
      let callCount = 0;
      (mockCrypto.decryptWithRawKey as any).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { invoiceId: '123456field', data: { amount: 15400000 } };
        } else {
          return sampleTaxGroups;
        }
      });

      (mockRegistry.getInvoiceTaxTag as any).mockResolvedValue('tax_tag_field' as AleoField);

      const auditKey = 'a'.repeat(64);
      const result = await service.verifyV3(envelope, auditKey, {
        protocol: mockProtocol,
        crypto: mockCrypto,
        registry: mockRegistry
      });

      expect(result.step3TaxCheck.ok).toBe(false);
      expect(result.step3TaxCheck.verificationA?.ok).toBe(false);
    });

    it('should skip tax check when no tax_groups_ciphertext', async () => {
      const envelope = createMockEnvelopeV3({
        encryption: {
          algorithm: 'AES-256-GCM',
          iv: 'base64iv==',
          auth_tag: 'base64tag==',
          ciphertext: 'base64ciphertext=='
          // No tax_groups_ciphertext
        }
      });

      const auditKey = 'a'.repeat(64);
      const result = await service.verifyV3(envelope, auditKey, {
        protocol: mockProtocol,
        crypto: mockCrypto,
        registry: mockRegistry
      });

      expect(result.step3TaxCheck.ok).toBe(true);
      expect(result.step3TaxCheck.message).toMatch(/no.*tax|skipped/i);
    });
  });

  describe('Overall Verification', () => {
    it('should return overallValid=true when all steps pass', async () => {
      const envelope = createMockEnvelopeV3({
        role: 'seller',
        jct_registration_hint: '1234567890123',
        encryption: {
          algorithm: 'AES-256-GCM',
          iv: 'base64iv==',
          auth_tag: 'base64tag==',
          ciphertext: 'base64ciphertext==',
          tax_groups_ciphertext: 'encrypted_tax_groups',
          tax_groups_iv: 'tax_iv',
          tax_groups_auth_tag: 'tax_tag'
        }
      });

      // Setup mocks for all steps to pass
      let decryptCallCount = 0;
      (mockCrypto.decryptWithRawKey as any).mockImplementation(async () => {
        decryptCallCount++;
        if (decryptCallCount === 1) {
          return { invoiceId: '123456field', data: { amount: 15400000 } };
        } else {
          return sampleTaxGroups;
        }
      });
      (mockRegistry.getInvoiceTaxTag as any).mockResolvedValue('tax_tag_field' as AleoField);

      const auditKey = 'a'.repeat(64);
      const result = await service.verifyV3(envelope, auditKey, {
        protocol: mockProtocol,
        crypto: mockCrypto,
        registry: mockRegistry
      });

      expect(result.overallValid).toBe(true);
      expect(result.step1Identity.ok).toBe(true);
      expect(result.step2MoneyFlow.ok).toBe(true);
      expect(result.step3TaxCheck.ok).toBe(true);
    });

    it('should return overallValid=false when any step fails', async () => {
      // Make Step 1 fail
      (mockRegistry.getInvoiceJctReg as any).mockResolvedValue('wrong_hash' as AleoField);

      const envelope = createMockEnvelopeV3({
        jct_registration_hint: '1234567890123'
      });

      const auditKey = 'a'.repeat(64);
      const result = await service.verifyV3(envelope, auditKey, {
        protocol: mockProtocol,
        crypto: mockCrypto,
        registry: mockRegistry
      });

      expect(result.overallValid).toBe(false);
    });

    // Note: verifyV3 does not check envelope expiration internally.
    // Expiration should be checked by the caller before invoking verifyV3.
    // This test documents the current behavior.
    it('should not check expiration (caller responsibility)', async () => {
      const envelope = createMockEnvelopeV3({
        context: {
          invoice_ids: ['123456field' as AleoField],
          audit_key_hash: 'audit_key_hash_field' as AleoField,
          expires_at: 1 // Expired (1 second after epoch)
        }
      });

      const auditKey = 'a'.repeat(64);
      const result = await service.verifyV3(envelope, auditKey, {
        protocol: mockProtocol,
        crypto: mockCrypto,
        registry: mockRegistry
      });

      // verifyV3 does not check expiration, so this should still pass if other steps pass
      // The caller (e.g., validateEnvelope) should check expiration
      expect(result.step1Identity.ok).toBe(true); // No JCT hint in default
    });

    it('should fail when decryption fails with wrong key', async () => {
      (mockCrypto.decryptWithRawKey as any).mockRejectedValue(new Error('Decryption failed'));

      const envelope = createMockEnvelopeV3();
      const wrongKey = 'b'.repeat(64);

      const result = await service.verifyV3(envelope, wrongKey, {
        protocol: mockProtocol,
        crypto: mockCrypto,
        registry: mockRegistry
      });

      expect(result.overallValid).toBe(false);
    });
  });
});
