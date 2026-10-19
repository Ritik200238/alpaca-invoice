import { describe, expect, it, vi } from 'vitest';
import { AuditService } from '@/services/AuditService/AuditServiceImpl';

describe('CryptoService audit package negatives', () => {
  const auditService = new AuditService({
    signerAddress: 'aleo1test' as any,
    signMessage: async () => 'sig'
  });
  const adapter = {
    assertRules: vi.fn(),
    assertAmount: vi.fn(),
    assertOwnership: vi.fn(),
    assertCommitment: vi.fn()
  };

  it('fails when expired', async () => {
    const now = Date.now();
    const pkg: any = {
      invoice_id: '1field',
      invoice_hash: '2field',
      rules_hash: '3field',
      commitments_root: '4field',
      field_commitments: { amount: '5field' },
      audit_key_hash: '6field',
      scopes_bitmask: '1',
      expires_at: now - 1000, // already expired (ms)
      selected_fields: ['amount'],
      payload: {}
    };
    const res = await auditService.verifyAuditPackage(pkg, adapter as any);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('expired');
  });
});
