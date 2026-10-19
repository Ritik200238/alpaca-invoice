// createInvoice: what it records, what it refuses, what it keeps off the ledger.
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { InvoiceStatus, pureCircuits } from '../build/contract/index.js';
import { randomBytes32, toHex } from '../src/util.js';
import {
  BUYER_SECRET,
  MICRO,
  NO_GROUPS,
  SELLER_SECRET,
  STRANGER_SECRET,
  T0,
  ZERO32,
  actor,
  create,
  ctx,
  deploy,
  expectThrows,
  jctTerms,
  led,
  plainTerms,
  publicRecord,
} from './harness.js';

const setup = () => {
  const d = deploy();
  return { d, seller: actor(d, SELLER_SECRET), buyer: actor(d, BUYER_SECRET) };
};

describe('createInvoice: what it records', () => {
  it('creates a pending invoice and fills every mapping the Aleo program filled', () => {
    const { d, seller, buyer } = setup();
    const c = create(d, seller, buyer);
    const l = led(c.d);

    expect(l.invoiceStatus.lookup(c.invoiceId)).toBe(InvoiceStatus.pending);
    expect(l.invoiceRegistry.member(c.invoiceId)).toBe(true);
    expect(l.invoiceCommitment.member(c.invoiceId)).toBe(true);
    expect(l.invoiceFieldCommitments.member(c.invoiceId)).toBe(true);
    expect(l.invoiceRulesResult.member(c.invoiceId)).toBe(true);
    expect(l.invoiceTaxTag.member(c.invoiceId)).toBe(true);
    expect(l.invoiceJctReg.member(c.invoiceId)).toBe(true);
    expect(l.invoiceArbiter.member(c.invoiceId)).toBe(true);

    const parties = l.invoiceParties.lookup(c.invoiceId);
    expect(toHex(parties.sellerKey)).toBe(toHex(seller.key));
    expect(toHex(parties.buyerKey)).toBe(toHex(buyer.key));
  });

  it('counts the invoice against the seller twice over, as the Aleo program did', () => {
    const { d, seller, buyer } = setup();
    const c = create(d, seller, buyer);
    expect(led(c.d).invoiceCount.lookup(seller.key)).toBe(1n);
    expect(led(c.d).auditCounter.lookup(seller.key)).toBe(1n);

    const c2 = create(c.d, seller, buyer);
    expect(led(c2.d).invoiceCount.lookup(seller.key)).toBe(2n);
    expect(led(c2.d).auditCounter.lookup(seller.key)).toBe(2n);
  });

  it('derives the identifier from the seller key and the nonce', () => {
    const { d, seller, buyer } = setup();
    const c = create(d, seller, buyer);
    expect(toHex(c.invoiceId)).toBe(toHex(pureCircuits.deriveInvoiceId(seller.key, c.nonce)));
  });

  it('records the arbiter, or zero when there is none', () => {
    const { d, seller, buyer } = setup();
    const none = create(d, seller, buyer);
    expect(toHex(led(none.d).invoiceArbiter.lookup(none.invoiceId))).toBe(toHex(ZERO32));

    const arbiter = actor(d, STRANGER_SECRET);
    const some = create(d, seller, buyer, { arbiterKey: arbiter.key });
    expect(toHex(led(some.d).invoiceArbiter.lookup(some.invoiceId))).toBe(toHex(arbiter.key));
  });

  it('is a different invoice for each nonce, so one seller can issue the same terms twice', () => {
    const { d, seller, buyer } = setup();
    const a = create(d, seller, buyer);
    const b = create(a.d, seller, buyer);
    expect(toHex(a.invoiceId)).not.toBe(toHex(b.invoiceId));
  });
});

describe('createInvoice: commitments', () => {
  it('stores the invoice hash a party can recompute from the terms', () => {
    const { d, seller, buyer } = setup();
    const c = create(d, seller, buyer);
    const frame = { sellerKey: seller.key, buyerKey: buyer.key, terms: c.terms };
    expect(toHex(led(c.d).invoiceRegistry.lookup(c.invoiceId))).toBe(
      toHex(pureCircuits.computeInvoiceHash(frame, c.nonce)),
    );
  });

  it('stores eleven field commitments that recompute exactly, and a root over them', () => {
    const { d, seller, buyer } = setup();
    const c = create(d, seller, buyer, { terms: jctTerms() });
    const frame = { sellerKey: seller.key, buyerKey: buyer.key, terms: c.terms };
    const taxTag = pureCircuits.computeTaxTag(c.terms.taxGroups, c.nonce);
    const jctReg = pureCircuits.computeJctReg(c.terms.jctNumber);
    const expected = pureCircuits.computeFieldCommitments(frame, c.nonce, taxTag, jctReg);

    const stored = led(c.d).invoiceFieldCommitments.lookup(c.invoiceId);
    const names = Object.keys(expected) as (keyof typeof expected)[];
    expect(names).toHaveLength(11);
    for (const name of names) {
      expect(toHex(stored[name]), name).toBe(toHex(expected[name]));
    }
    expect(toHex(led(c.d).invoiceCommitment.lookup(c.invoiceId))).toBe(
      toHex(pureCircuits.computeCommitmentRoot(expected)),
    );
  });

  it('gives each field its own salt, so opening one field opens only that one', () => {
    const nonce = randomBytes32();
    const a = pureCircuits.deriveFieldSalt(nonce, pureCircuits.tagFieldAmount());
    const b = pureCircuits.deriveFieldSalt(nonce, pureCircuits.tagFieldTax());
    expect(toHex(a)).not.toBe(toHex(b));

    // The same value under two tags, with the same nonce, commits differently.
    const v = new Uint8Array(32).fill(7);
    expect(toHex(pureCircuits.commitField(pureCircuits.tagFieldAmount(), v, nonce))).not.toBe(
      toHex(pureCircuits.commitField(pureCircuits.tagFieldTax(), v, nonce)),
    );
  });

  it('lets an auditor reproduce a field from its salt alone, without the nonce', () => {
    const nonce = randomBytes32();
    const tag = pureCircuits.tagFieldAmount();
    const v = new Uint8Array(32).fill(9);
    const salt = pureCircuits.deriveFieldSalt(nonce, tag);
    expect(toHex(pureCircuits.commitFieldWithSalt(tag, v, salt))).toBe(
      toHex(pureCircuits.commitField(tag, v, nonce)),
    );
    // And the nonce itself is not a usable salt, so handing over one field's salt
    // does not let the auditor test guesses against the others.
    expect(toHex(pureCircuits.commitFieldWithSalt(tag, v, nonce))).not.toBe(
      toHex(pureCircuits.commitField(tag, v, nonce)),
    );
  });

  it('stores a tax tag and registration digest for a qualified invoice, zero otherwise', () => {
    const { d, seller, buyer } = setup();
    const plain = create(d, seller, buyer);
    expect(toHex(led(plain.d).invoiceTaxTag.lookup(plain.invoiceId))).toBe(toHex(ZERO32));
    expect(toHex(led(plain.d).invoiceJctReg.lookup(plain.invoiceId))).toBe(toHex(ZERO32));

    const jct = create(d, seller, buyer, { terms: jctTerms() });
    expect(toHex(led(jct.d).invoiceTaxTag.lookup(jct.invoiceId))).toBe(
      toHex(pureCircuits.computeTaxTag(jct.terms.taxGroups, jct.nonce)),
    );
    expect(toHex(led(jct.d).invoiceJctReg.lookup(jct.invoiceId))).toBe(
      toHex(pureCircuits.computeJctReg(jct.terms.jctNumber)),
    );
  });

  it('salts the tax tag, so identical tax groups on two invoices do not share a tag', () => {
    // A bare hash of round amounts would be identical, and guessable.
    const a = pureCircuits.computeTaxTag(jctTerms().taxGroups, randomBytes32());
    const b = pureCircuits.computeTaxTag(jctTerms().taxGroups, randomBytes32());
    expect(toHex(a)).not.toBe(toHex(b));
  });
});

describe('createInvoice: privacy', () => {
  it('writes no amount, tax, total or due date into public state', () => {
    const { d, seller, buyer } = setup();
    const c = create(d, seller, buyer);
    const text = publicRecord(c.d, c.invoiceId);
    for (const n of [c.terms.amount, c.terms.taxAmount, c.terms.totalAmount, c.terms.dueDate]) {
      expect(text).not.toContain(n.toString());
    }
  });

  it('writes no payout address into public state', () => {
    const { d, seller, buyer } = setup();
    const c = create(d, seller, buyer);
    const text = publicRecord(c.d, c.invoiceId);
    expect(text).not.toContain(toHex(c.terms.sellerPayout));
    expect(text).not.toContain(toHex(c.terms.buyerPayout));
  });
});

describe('createInvoice: rules that are enforced', () => {
  it('refuses a seller invoicing themselves', () => {
    const { d, seller } = setup();
    expectThrows(() => create(d, seller, seller), 'seller and buyer must differ');
  });

  it('refuses a zero amount', () => {
    const { d, seller, buyer } = setup();
    expectThrows(
      () =>
        create(d, seller, buyer, {
          terms: plainTerms({ amount: 0n, taxAmount: 0n, totalAmount: 0n }),
        }),
      'amount must be positive',
    );
  });

  it('refuses an amount above the cap, and accepts the cap itself', () => {
    const { d, seller, buyer } = setup();
    const cap = 1_000_000_000_000_000n;
    expectThrows(
      () =>
        create(d, seller, buyer, {
          terms: plainTerms({ amount: cap + 1n, taxAmount: 0n, totalAmount: cap + 1n }),
        }),
      'amount exceeds the maximum',
    );
    expect(() =>
      create(d, seller, buyer, {
        terms: plainTerms({ amount: cap, taxAmount: 0n, totalAmount: cap }),
      }),
    ).not.toThrow();
  });

  it('refuses a total that is not amount plus tax', () => {
    const { d, seller, buyer } = setup();
    expectThrows(
      () => create(d, seller, buyer, { terms: plainTerms({ totalAmount: 111n * MICRO }) }),
      'total must equal amount plus tax',
    );
  });

  it('refuses a due date behind the claimed time, and accepts one equal to it', () => {
    const { d, seller, buyer } = setup();
    expectThrows(
      () => create(d, seller, buyer, { terms: plainTerms({ dueDate: T0 - 1n }) }),
      'due date is in the past',
    );
    expect(() => create(d, seller, buyer, { terms: plainTerms({ dueDate: T0 }) })).not.toThrow();
  });

  it('refuses an invoice id that is already used', () => {
    const { d, seller, buyer } = setup();
    const nonce = randomBytes32();
    const first = create(d, seller, buyer, { nonce });
    expectThrows(() => create(first.d, seller, buyer, { nonce }), 'invoice id already used');
  });
});

describe('createInvoice: qualified-invoice tax rules', () => {
  it('accepts consistent tax groups', () => {
    const { d, seller, buyer } = setup();
    expect(() => create(d, seller, buyer, { terms: jctTerms() })).not.toThrow();
  });

  it('refuses group A when its tax is not net times rate', () => {
    const { d, seller, buyer } = setup();
    const t = jctTerms();
    expectThrows(
      () =>
        create(d, seller, buyer, {
          terms: jctTerms({
            taxGroups: { ...t.taxGroups, groupA: { ...t.taxGroups.groupA, taxSum: 11n * MICRO } },
          }),
        }),
      'tax group A is inconsistent',
    );
  });

  it('refuses group B when its tax is not net times rate', () => {
    const { d, seller, buyer } = setup();
    const t = jctTerms();
    expectThrows(
      () =>
        create(d, seller, buyer, {
          terms: jctTerms({
            taxGroups: { ...t.taxGroups, groupB: { ...t.taxGroups.groupB, taxSum: 5n * MICRO } },
          }),
        }),
      'tax group B is inconsistent',
    );
  });

  it('refuses groups that do not add up to the total', () => {
    const { d, seller, buyer } = setup();
    const t = jctTerms();
    // Each group stays internally consistent but group B is larger, so only the
    // sum rule can catch it.
    expectThrows(
      () =>
        create(d, seller, buyer, {
          terms: jctTerms({
            taxGroups: {
              ...t.taxGroups,
              groupB: { rateBps: 800n, netSum: 100n * MICRO, taxSum: 8n * MICRO },
            },
          }),
        }),
      'tax groups do not add up to the total',
    );
  });

  it('refuses a rate above 100%', () => {
    const { d, seller, buyer } = setup();
    expectThrows(
      () =>
        create(d, seller, buyer, {
          terms: jctTerms({
            taxGroups: {
              groupA: { rateBps: 10_001n, netSum: 100n * MICRO, taxSum: 100_010_000n },
              groupB: NO_GROUPS.groupB,
            },
            amount: 100n * MICRO,
            taxAmount: 100_010_000n,
            totalAmount: 200_010_000n,
            lineItemsSum: 100n * MICRO,
            expectedTotal: 200_010_000n,
          }),
        }),
      'tax group A is inconsistent',
    );
  });

  it('refuses an unused slot that carries a value', () => {
    const { d, seller, buyer } = setup();
    const t = jctTerms();
    expectThrows(
      () =>
        create(d, seller, buyer, {
          terms: jctTerms({
            taxGroups: { ...t.taxGroups, groupB: { rateBps: 0n, netSum: 1n, taxSum: 0n } },
          }),
        }),
      'tax group B is inconsistent',
    );
  });

  it('ignores the groups on an invoice that is not qualified', () => {
    // Aleo skipped these checks when the tax tag was zero. Garbage in the groups
    // of a plain invoice must neither fail it nor leak into a stored tag.
    const { d, seller, buyer } = setup();
    const c = create(d, seller, buyer, {
      terms: plainTerms({
        taxGroups: {
          groupA: { rateBps: 9n, netSum: 9n, taxSum: 9n },
          groupB: { rateBps: 9n, netSum: 9n, taxSum: 9n },
        },
      }),
    });
    expect(toHex(led(c.d).invoiceTaxTag.lookup(c.invoiceId))).toBe(toHex(ZERO32));
  });

  it('is exact where the Aleo form was not', () => {
    // 15,000 at 10% is 1,500. The Aleo expression (net / 10000) * rate gave 1,000,
    // which only matched the true tax when the net was a multiple of 10000.
    const { d, seller, buyer } = setup();
    const net = 15_000n;
    const tax = 1_500n;
    expect(() =>
      create(d, seller, buyer, {
        terms: jctTerms({
          amount: net,
          taxAmount: tax,
          totalAmount: net + tax,
          lineItemsSum: net,
          expectedTotal: net + tax,
          taxGroups: {
            groupA: { rateBps: 1000n, netSum: net, taxSum: tax },
            groupB: NO_GROUPS.groupB,
          },
        }),
      }),
    ).not.toThrow();
  });
});

describe('createInvoice: the recorded rule results', () => {
  const digest = (d: ReturnType<typeof setup>['d'], id: Uint8Array) =>
    toHex(led(d).invoiceRulesResult.lookup(id));
  const expected = (r1: boolean, r2: boolean, r3: boolean, r4: boolean) =>
    toHex(pureCircuits.computeRulesResult(r1, r2, r3, r4, true));

  it('records all five rules as holding for a consistent invoice', () => {
    const { d, seller, buyer } = setup();
    const c = create(d, seller, buyer);
    expect(digest(c.d, c.invoiceId)).toBe(expected(true, true, true, true));
  });

  it('records R1 false when the tax does not match the stated rate, without refusing', () => {
    // Recorded, not enforced, exactly as on Aleo: the digest is what an audit
    // compares against, and an invoice that fails a rule is still an invoice.
    const { d, seller, buyer } = setup();
    const c = create(d, seller, buyer, { terms: plainTerms({ taxRateBps: 800n }) });
    expect(digest(c.d, c.invoiceId)).toBe(expected(false, true, true, true));
  });

  it('records R3 false when the stated expected total differs', () => {
    const { d, seller, buyer } = setup();
    const c = create(d, seller, buyer, { terms: plainTerms({ expectedTotal: 1n }) });
    expect(digest(c.d, c.invoiceId)).toBe(expected(true, true, false, true));
  });

  it('records R4 false when the line items do not sum to the amount', () => {
    const { d, seller, buyer } = setup();
    const c = create(d, seller, buyer, { terms: plainTerms({ lineItemsSum: 1n }) });
    expect(digest(c.d, c.invoiceId)).toBe(expected(true, true, true, false));
  });
});

describe('createInvoice: time', () => {
  it('refuses a claimed time ahead of the block', () => {
    const { d, seller, buyer } = setup();
    expectThrows(() => create(d, seller, buyer, { claimedTime: T0 + 1n }), 'timestamp is in the future');
  });

  it('refuses a claimed time further behind the block than the window', () => {
    const { d, seller, buyer } = setup();
    const w = pureCircuits.TIMESTAMP_WINDOW();
    expectThrows(
      () => create(d, seller, buyer, { claimedTime: T0 - w - 1n }),
      'timestamp is too far in the past',
    );
    expect(() => create(d, seller, buyer, { claimedTime: T0 - w })).not.toThrow();
  });

  it('allows exactly one hour of slack, pinned here on purpose', () => {
    // The tests above take their bound from the contract, so widening the window
    // would leave them green while the guarantee got weaker. Pinning the number
    // makes loosening it a change someone has to justify.
    expect(pureCircuits.TIMESTAMP_WINDOW()).toBe(3600n);
  });
});

describe('createInvoice: the witness boundary', () => {
  it('refuses to prove with a secret of the wrong length', () => {
    const { d, buyer } = setup();
    const seller = { ...actor(d, SELLER_SECRET), state: { secret: new Uint8Array(31).fill(1) } };
    expectThrows(() => create(d, seller, buyer), 'must be 32 bytes');
  });

  it('refuses to prove with an all-zero secret', () => {
    const { d, buyer } = setup();
    const seller = { ...actor(d, SELLER_SECRET), state: { secret: new Uint8Array(32) } };
    expectThrows(() => create(d, seller, buyer), 'all zeros');
  });

  it('refuses to prove with an all-zero nonce', () => {
    const { d, seller, buyer } = setup();
    expectThrows(() => create(d, seller, buyer, { nonce: new Uint8Array(32) }), 'all zeros');
  });

  it('refuses to create when no invoice has been staged', () => {
    const { d, seller, buyer } = setup();
    expectThrows(
      () => d.contract.impureCircuits.createInvoice(ctx(d, seller.state), buyer.key, ZERO32, T0),
      'no invoice is staged',
    );
  });
});
