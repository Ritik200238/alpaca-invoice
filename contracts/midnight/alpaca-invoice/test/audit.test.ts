// setAuditAuthorization: who may grant an auditor sight, of what, until when.
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { pureCircuits } from '../build/contract/index.js';
import { randomBytes32, toHex } from '../src/util.js';
import {
  BUYER_SECRET,
  DAY,
  SELLER_SECRET,
  STRANGER_SECRET,
  T0,
  ZERO32,
  actor,
  advance,
  create,
  ctx,
  deploy,
  expectThrows,
  led,
} from './harness.js';

const NONE = Array<boolean>(9).fill(false);
const only = (...slots: number[]) => NONE.map((_, i) => slots.includes(i));

const setup = () => {
  const d = deploy();
  const seller = actor(d, SELLER_SECRET);
  const buyer = actor(d, BUYER_SECRET);
  const stranger = actor(d, STRANGER_SECRET);
  return { created: create(d, seller, buyer), seller, buyer, stranger };
};

type Options = {
  scopes?: boolean[];
  auditKeyHash?: Uint8Array;
  expiresAt?: bigint;
  claimedTime?: bigint;
  blockTime?: bigint;
  invoiceId?: Uint8Array;
};

const grant = (
  c: ReturnType<typeof setup>['created'],
  who: ReturnType<typeof actor>,
  o: Options = {},
) => {
  const result = c.d.contract.impureCircuits.setAuditAuthorization(
    ctx(c.d, who.state, o.blockTime ?? T0),
    o.invoiceId ?? c.invoiceId,
    o.auditKeyHash ?? randomBytes32(),
    o.scopes ?? only(0, 1),
    o.expiresAt ?? T0 + 7n * DAY,
    o.claimedTime ?? T0,
  );
  return { d: advance(c.d, result) };
};

describe('setAuditAuthorization', () => {
  it('records the hash of the key, the scopes, the expiry and the issuer', () => {
    const { created, seller } = setup();
    const auditKeyHash = randomBytes32();
    const { d } = grant(created, seller, { auditKeyHash, scopes: only(0, 5, 8), expiresAt: T0 + 3n * DAY });
    const a = led(d).auditAuthorization.lookup(created.invoiceId);
    expect(toHex(a.auditKeyHash)).toBe(toHex(auditKeyHash));
    expect(a.scopes).toEqual(only(0, 5, 8));
    expect(a.expiresAt).toBe(T0 + 3n * DAY);
    expect(toHex(a.issuer)).toBe(toHex(seller.key));
  });

  it('keeps nine scope slots in the order the audit bitmask uses', () => {
    // Slot i is bit i+1 of the Aleo scopes_bitmask: amount, tax, due date, buyer,
    // seller, currency, items, memo, order id.
    const { created, seller } = setup();
    const { d } = grant(created, seller, { scopes: only(8) });
    const a = led(d).auditAuthorization.lookup(created.invoiceId);
    expect(a.scopes).toHaveLength(9);
    expect(a.scopes[8]).toBe(true);
    expect(a.scopes.slice(0, 8).every((s) => s === false)).toBe(true);
  });

  it('lets the seller replace an earlier authorization', () => {
    const { created, seller } = setup();
    const first = grant(created, seller, { scopes: only(0) });
    const second = grant({ ...created, d: first.d }, seller, { scopes: only(1) });
    expect(led(second.d).auditAuthorization.lookup(created.invoiceId).scopes).toEqual(only(1));
  });

  it('refuses the buyer', () => {
    const { created, buyer } = setup();
    expectThrows(() => grant(created, buyer), 'caller is not the seller');
  });

  it('refuses a stranger', () => {
    const { created, stranger } = setup();
    expectThrows(() => grant(created, stranger), 'caller is not the seller');
  });

  it('refuses an unknown invoice', () => {
    const { created, seller } = setup();
    expectThrows(() => grant(created, seller, { invoiceId: randomBytes32() }), 'unknown invoice');
  });

  it('refuses an authorization that discloses nothing', () => {
    const { created, seller } = setup();
    expectThrows(() => grant(created, seller, { scopes: NONE }), 'at least one field');
  });

  it('refuses a zero audit key hash, which any auditor could claim to hold', () => {
    const { created, seller } = setup();
    expectThrows(() => grant(created, seller, { auditKeyHash: ZERO32 }), 'audit key hash must be set');
  });

  it('refuses an expiry that has already passed, and one equal to the block time', () => {
    const { created, seller } = setup();
    expectThrows(() => grant(created, seller, { expiresAt: T0 - 1n }), 'must expire in the future');
    expectThrows(() => grant(created, seller, { expiresAt: T0 }), 'must expire in the future');
    expect(() => grant(created, seller, { expiresAt: T0 + 1n })).not.toThrow();
  });

  it('judges the expiry against the chain, not against the claimed time', () => {
    // Aleo compared the expiry with a time the same caller supplied, which proved
    // nothing. Here a caller who claims a time long ago still cannot set an
    // expiry the block has already passed.
    const { created, seller } = setup();
    expectThrows(
      () => grant(created, seller, { expiresAt: T0 - DAY, claimedTime: T0 - 2n * DAY }),
      'must expire in the future',
    );
  });

  it('holds the claimed time to the block, both ways', () => {
    const { created, seller } = setup();
    const w = pureCircuits.TIMESTAMP_WINDOW();
    expectThrows(() => grant(created, seller, { claimedTime: T0 + 1n }), 'timestamp is in the future');
    expectThrows(() => grant(created, seller, { claimedTime: T0 - w - 1n }), 'timestamp is too far in the past');
  });

  it('can be granted on a paid or cancelled invoice, because Aleo allowed it too', () => {
    // Auditing is mostly about invoices that are already settled.
    const { created, seller } = setup();
    const cancelled = created.d.contract.impureCircuits.cancelInvoice(ctx(created.d, seller.state), created.invoiceId);
    expect(() => grant({ ...created, d: advance(created.d, cancelled) }, seller)).not.toThrow();
  });
});
