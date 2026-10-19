import { describe, expect, it } from 'vitest';
import { CryptoService } from '../CryptoServiceImpl';

describe('CryptoService.evaluateAuditRules', () => {
  const svc = new CryptoService();

  it('returns all rules passing and stable rules_hash', async () => {
    const res = await svc.evaluateAuditRules({
      amount: 100000n,
      taxAmount: 10000n,
      dueDate: Math.floor(Date.now() / 1000) + 3600,
      currentTime: Math.floor(Date.now() / 1000),
      lineItemsSum: 100000n,
      expectedTotal: 110000n,
      taxRateBps: 1000n,
      invoiceHash: '123field'
    });

    expect(res).toEqual({
      rulesHash:
        '3125026365439426501480674798776439277313875154219641951197310294303582568700field',
      r1: true,
      r2: true,
      r3: true,
      r4: true,
      r5: true
    });
  });

  it('fails the due-date rule when overdue and produces a different hash', async () => {
    const overdue = await svc.evaluateAuditRules({
      amount: 100000n,
      taxAmount: 10000n,
      dueDate: Math.floor(Date.now() / 1000) - 1, // past
      currentTime: Math.floor(Date.now() / 1000),
      lineItemsSum: 100000n,
      expectedTotal: 110000n,
      taxRateBps: 1000n,
      invoiceHash: '123field'
    });

    expect(overdue.r2).toBe(false);
    expect(overdue.rulesHash).not.toBe(
      '3125026365439426501480674798776439277313875154219641951197310294303582568700field'
    );
  });
});
