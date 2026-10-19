import { describe, expect, it, vi } from 'vitest';
import { AuditService } from '@/services/AuditService/AuditServiceImpl';

describe('CryptoService audit package helpers (unit)', () => {
  const auditService = new AuditService({
    signerAddress: 'aleo1test' as any,
    signMessage: async () => 'sig'
  });

  it('generateAuditPackage builds expected shape', async () => {
    const pkg = await auditService.generateAuditPackage({
      invoiceId: '1field',
      invoiceHash: '2field',
      rulesHash: '3field',
      fieldCommitments: { amount: '4field' },
      commitmentsRoot: '5field',
      auditKeyHash: '6field',
      scopesBitmask: 3n,
      expiresAt: 123,
      selectedFields: ['amount', 'buyer'],
      payload: { amount: 10 },
      programId: 'zk_invoice_v3_1.aleo'
    });
    expect(pkg.program_id).toBe('zk_invoice_v3_1.aleo');
    expect(pkg.scopes_bitmask).toBe('3');
    expect(pkg.field_commitments.amount).toBe('4field');
  });

  it('verifyAuditPackage detects rules hash mismatch', async () => {
    const pkg: any = {
      invoice_id: '1field',
      invoice_hash: '2field',
      rules_hash: 'wrong',
      commitments_root: '5field',
      field_commitments: { amount: '4field' },
      audit_key_hash: '6field',
      scopes_bitmask: '3',
      expires_at: 123,
      selected_fields: ['amount'],
      payload: {
        amount: 10,
        tax_amount: 0,
        due_date: 0,
        current_time: 0,
        line_items_sum: 10,
        expected_total: 10,
        tax_rate_bps: 0
      }
    };
    const adapter = {
      assertRules: vi.fn().mockRejectedValue(new Error('rules mismatch')),
      assertAmount: vi.fn(),
      assertOwnership: vi.fn(),
      assertCommitment: vi.fn()
    };
    const res = await auditService.verifyAuditPackage(pkg, adapter as any);
    expect(res.valid).toBe(false);
  });
});
