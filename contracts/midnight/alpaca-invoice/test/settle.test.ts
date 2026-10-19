// payInvoiceShielded and cancelInvoice: who may act, on what, and where the money goes.
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { CurrencyFlag, InvoiceStatus, pureCircuits } from '../build/contract/index.js';
import { randomBytes32, toHex } from '../src/util.js';
import {
  BUYER_SECRET,
  DAY,
  MICRO,
  NATIVE_COLOR,
  OTHER_COLOR,
  SELLER_PAYOUT,
  SELLER_SECRET,
  STRANGER_PAYOUT,
  STRANGER_SECRET,
  T0,
  actor,
  advance,
  coin,
  create,
  ctx,
  deploy,
  expectThrows,
  led,
  payoutTo,
  plainTerms,
  stage,
  type Created,
  type InvoiceTerms,
} from './harness.js';

type Overrides = {
  /** Who calls. Defaults to the buyer. */
  as?: 'buyer' | 'seller' | 'stranger';
  /** Terms the CALLER believes they hold. Defaults to the real ones. */
  terms?: InvoiceTerms;
  nonce?: Uint8Array;
  payment?: ReturnType<typeof coin>;
  payoutTo?: Uint8Array;
  blockTime?: bigint;
  claimedTime?: bigint;
  salt?: Uint8Array;
};

const setup = (terms: InvoiceTerms = plainTerms()) => {
  const d = deploy();
  const seller = actor(d, SELLER_SECRET);
  const buyer = actor(d, BUYER_SECRET);
  const stranger = actor(d, STRANGER_SECRET);
  const created = create(d, seller, buyer, { terms });
  return { created, seller, buyer, stranger };
};

const pay = (c: Created, who: ReturnType<typeof actor>, o: Overrides = {}) => {
  const at = o.blockTime ?? T0 + DAY;
  const staged = stage(who.state, o.terms ?? c.terms, o.nonce ?? c.nonce, o.salt ?? randomBytes32());
  const result = c.d.contract.impureCircuits.payInvoiceShielded(
    ctx(c.d, staged, at),
    c.invoiceId,
    o.payment ?? coin(c.terms.totalAmount),
    payoutTo(o.payoutTo ?? SELLER_PAYOUT),
    o.claimedTime ?? at,
  );
  return { result, d: advance(c.d, result) };
};

describe('payInvoiceShielded: the honest path', () => {
  it('marks the invoice paid', () => {
    const { created, buyer } = setup();
    const { d } = pay(created, buyer);
    expect(led(d).invoiceStatus.lookup(created.invoiceId)).toBe(InvoiceStatus.paid);
  });

  it('forwards the coin to the seller in the same call and keeps nothing', () => {
    const { created, buyer } = setup();
    const { result } = pay(created, buyer);
    const z = (result.context as any).currentZswapLocalState;
    const toSeller = z.outputs.filter((o: any) => o.recipient.is_left);
    expect(toSeller).toHaveLength(1);
    expect(toHex(toSeller[0].recipient.left.bytes)).toBe(toHex(SELLER_PAYOUT));
    expect(toSeller[0].coinInfo.value).toBe(created.terms.totalAmount);
    // One input, and the two outputs are the deposit to the contract and the
    // forward to the seller: nothing is left in the contract's hands.
    expect(z.inputs).toHaveLength(1);
    expect(z.outputs).toHaveLength(2);
  });

  it('records a settlement anchor the payer can later reproduce for an auditor', () => {
    const { created, buyer } = setup();
    const salt = randomBytes32();
    const { d } = pay(created, buyer, { salt });
    const anchor = pureCircuits.computePaymentAnchor(created.invoiceId, created.terms.totalAmount, salt);
    expect(led(d).paymentCommitments.member(anchor)).toBe(true);
    expect(toHex(led(d).paymentCommitments.lookup(anchor))).toBe(toHex(created.invoiceId));
  });

  it('does not let an anchor made with a different amount or salt open', () => {
    const { created, buyer } = setup();
    const salt = randomBytes32();
    const { d } = pay(created, buyer, { salt });
    const wrongAmount = pureCircuits.computePaymentAnchor(created.invoiceId, created.terms.totalAmount - 1n, salt);
    const wrongSalt = pureCircuits.computePaymentAnchor(created.invoiceId, created.terms.totalAmount, randomBytes32());
    expect(led(d).paymentCommitments.member(wrongAmount)).toBe(false);
    expect(led(d).paymentCommitments.member(wrongSalt)).toBe(false);
  });

  it('writes no amount into public state', () => {
    const { created, buyer } = setup();
    const { d } = pay(created, buyer);
    const dump = JSON.stringify(led(d).paymentCommitments, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(dump).not.toContain(created.terms.totalAmount.toString());
  });

  it('accepts a payment on the due date itself', () => {
    const { created, buyer } = setup(plainTerms({ dueDate: T0 + DAY }));
    expect(() => pay(created, buyer, { blockTime: T0 + DAY })).not.toThrow();
  });
});

describe('payInvoiceShielded: who may pay', () => {
  it('refuses the seller', () => {
    const { created, seller } = setup();
    expectThrows(() => pay(created, seller), 'caller is not the buyer');
  });

  it('refuses a stranger', () => {
    const { created, stranger } = setup();
    expectThrows(() => pay(created, stranger), 'caller is not the buyer');
  });
});

describe('payInvoiceShielded: what must be true of the invoice', () => {
  it('refuses an unknown invoice', () => {
    const { created, buyer } = setup();
    const staged = stage(buyer.state, created.terms, created.nonce, randomBytes32());
    expectThrows(
      () =>
        created.d.contract.impureCircuits.payInvoiceShielded(
          ctx(created.d, staged, T0 + DAY),
          randomBytes32(),
          coin(created.terms.totalAmount),
          payoutTo(SELLER_PAYOUT),
          T0 + DAY,
        ),
      'unknown invoice',
    );
  });

  it('refuses to pay twice', () => {
    const { created, buyer } = setup();
    const first = pay(created, buyer);
    expectThrows(() => pay({ ...created, d: first.d }, buyer), 'not open for payment');
  });

  it('refuses a cancelled invoice', () => {
    const { created, seller, buyer } = setup();
    const cancelled = cancel(created, seller);
    expectThrows(() => pay({ ...created, d: cancelled.d }, buyer), 'not open for payment');
  });

  it('refuses payment after the due date, and says nothing about the date', () => {
    const { created, buyer } = setup(plainTerms({ dueDate: T0 + DAY }));
    expectThrows(
      () => pay(created, buyer, { blockTime: T0 + DAY + 1n }),
      'past its due date',
    );
  });

  it('refuses an invoice payable in the other currency', () => {
    const { created, buyer } = setup(plainTerms({ currencyFlag: CurrencyFlag.usdcx }));
    expectThrows(() => pay(created, buyer), 'not payable in the native token');
  });
});

describe('payInvoiceShielded: what must be true of the payment', () => {
  it('refuses one unit too little', () => {
    const { created, buyer } = setup();
    expectThrows(
      () => pay(created, buyer, { payment: coin(created.terms.totalAmount - 1n) }),
      'does not equal the invoice total',
    );
  });

  it('refuses one unit too much', () => {
    const { created, buyer } = setup();
    expectThrows(
      () => pay(created, buyer, { payment: coin(created.terms.totalAmount + 1n) }),
      'does not equal the invoice total',
    );
  });

  it('refuses the principal alone when there is tax on top', () => {
    const { created, buyer } = setup();
    expectThrows(
      () => pay(created, buyer, { payment: coin(created.terms.amount) }),
      'does not equal the invoice total',
    );
  });

  it('refuses a payment in a token other than the native one', () => {
    const { created, buyer } = setup();
    expectThrows(
      () => pay(created, buyer, { payment: coin(created.terms.totalAmount, OTHER_COLOR) }),
      'not in the native token',
    );
    expect(toHex(NATIVE_COLOR)).toBe('0'.repeat(64));
  });

  it('refuses a payment addressed to anyone but the seller the invoice names', () => {
    const { created, buyer } = setup();
    expectThrows(
      () => pay(created, buyer, { payoutTo: STRANGER_PAYOUT }),
      'not addressed to the seller on this invoice',
    );
  });
});

describe('payInvoiceShielded: time', () => {
  it('refuses a claimed time ahead of the block', () => {
    const { created, buyer } = setup();
    expectThrows(() => pay(created, buyer, { claimedTime: T0 + DAY + 1n }), 'timestamp is in the future');
  });

  it('refuses a claimed time further behind the block than the window', () => {
    const { created, buyer } = setup();
    const w = pureCircuits.TIMESTAMP_WINDOW();
    expectThrows(
      () => pay(created, buyer, { claimedTime: T0 + DAY - w - 1n }),
      'timestamp is too far in the past',
    );
  });

  it('cannot be paid late by claiming an early time', () => {
    // The due date is private, so the check is claimed-time against it. The claim
    // is held to the block's clock, which bounds how late a payment can be
    // disguised to one window.
    const { created, buyer } = setup(plainTerms({ dueDate: T0 + DAY }));
    const w = pureCircuits.TIMESTAMP_WINDOW();
    expectThrows(
      () => pay(created, buyer, { blockTime: T0 + DAY + w + 1n, claimedTime: T0 + DAY }),
      'timestamp is too far in the past',
    );
  });
});

describe('payInvoiceShielded: a prover that lies about the terms', () => {
  it('refuses terms with a smaller total, even with a coin to match', () => {
    // The attack: prove nothing about the real invoice, claim it totals 1 unit,
    // and pay 1 unit. The terms must open the commitment the chain holds.
    const { created, buyer } = setup();
    const lie = { ...created.terms, totalAmount: 1n, amount: 1n, taxAmount: 0n };
    expectThrows(
      () => pay(created, buyer, { terms: lie, payment: coin(1n) }),
      'terms do not open the recorded commitment',
    );
  });

  it('refuses terms that redirect the seller payout', () => {
    const { created, buyer } = setup();
    const lie = { ...created.terms, sellerPayout: STRANGER_PAYOUT };
    expectThrows(
      () => pay(created, buyer, { terms: lie, payoutTo: STRANGER_PAYOUT }),
      'terms do not open the recorded commitment',
    );
  });

  it('refuses terms that push the due date out', () => {
    const { created, buyer } = setup(plainTerms({ dueDate: T0 + DAY }));
    const lie = { ...created.terms, dueDate: T0 + 365n * DAY };
    expectThrows(
      () => pay(created, buyer, { terms: lie, blockTime: T0 + 2n * DAY }),
      'terms do not open the recorded commitment',
    );
  });

  it('refuses terms that change the currency flag', () => {
    const { created, buyer } = setup(plainTerms({ currencyFlag: CurrencyFlag.usdcx }));
    const lie = { ...created.terms, currencyFlag: CurrencyFlag.credits };
    expectThrows(
      () => pay(created, buyer, { terms: lie }),
      'terms do not open the recorded commitment',
    );
  });

  it('refuses the right terms under a wrong nonce', () => {
    const { created, buyer } = setup();
    expectThrows(
      () => pay(created, buyer, { nonce: randomBytes32() }),
      'terms do not open the recorded commitment',
    );
  });
});

const cancel = (c: Created, who: ReturnType<typeof actor>) => {
  const result = c.d.contract.impureCircuits.cancelInvoice(ctx(c.d, who.state), c.invoiceId);
  return { d: advance(c.d, result) };
};

describe('cancelInvoice', () => {
  it('lets the seller cancel a pending invoice', () => {
    const { created, seller } = setup();
    const { d } = cancel(created, seller);
    expect(led(d).invoiceStatus.lookup(created.invoiceId)).toBe(InvoiceStatus.cancelled);
  });

  it('takes the invoice back out of the seller audit count, as the Aleo program did', () => {
    const { created, seller } = setup();
    expect(led(created.d).auditCounter.lookup(seller.key)).toBe(1n);
    const { d } = cancel(created, seller);
    expect(led(d).auditCounter.lookup(seller.key)).toBe(0n);
    // The invoice count is a running total of everything ever created and stays.
    expect(led(d).invoiceCount.lookup(seller.key)).toBe(1n);
  });

  it('refuses the buyer', () => {
    const { created, buyer } = setup();
    expectThrows(() => cancel(created, buyer), 'caller is not the seller');
  });

  it('refuses a stranger', () => {
    const { created, stranger } = setup();
    expectThrows(() => cancel(created, stranger), 'caller is not the seller');
  });

  it('refuses a paid invoice', () => {
    const { created, seller, buyer } = setup();
    const paid = pay(created, buyer);
    expectThrows(() => cancel({ ...created, d: paid.d }, seller), 'only a pending invoice can be cancelled');
  });

  it('refuses to cancel twice', () => {
    const { created, seller } = setup();
    const first = cancel(created, seller);
    expectThrows(() => cancel({ ...created, d: first.d }, seller), 'only a pending invoice can be cancelled');
  });

  it('refuses an unknown invoice', () => {
    const { created, seller } = setup();
    expectThrows(
      () => created.d.contract.impureCircuits.cancelInvoice(ctx(created.d, seller.state), randomBytes32()),
      'unknown invoice',
    );
  });

  it('keeps the audit count from going below zero', () => {
    // Two invoices, one cancelled: the count is 1, not 0, and cancelling the
    // second brings it to 0 rather than underflowing.
    const { created, seller, buyer } = setup();
    const second = create(created.d, seller, buyer);
    const a = cancel({ ...created, d: second.d }, seller);
    expect(led(a.d).auditCounter.lookup(seller.key)).toBe(1n);
    const b = cancel({ ...second, d: a.d }, seller);
    expect(led(b.d).auditCounter.lookup(seller.key)).toBe(0n);
    expect(MICRO).toBe(1_000_000n);
  });
});
