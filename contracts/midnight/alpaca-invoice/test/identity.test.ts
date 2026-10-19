// Party keys: what they depend on, and what they must not.
//
// SPDX-License-Identifier: Apache-2.0
//
// Found by the mutation sweep. Every other test derives a party key through the
// contract's own pure circuit and then hands it back to the contract, so a
// contract that quietly dropped the deployment salt from the derivation would
// still agree with itself and every test would stay green. The only way to see it
// is to compare keys across deployments, which is what these do.

import { describe, expect, it } from 'vitest';

import { pureCircuits } from '../build/contract/index.js';
import { toHex } from '../src/util.js';
import {
  BUYER_SECRET,
  INSTANCE_SALT,
  SELLER_SECRET,
  actor,
  bytes32,
  create,
  deploy,
  led,
} from './harness.js';

describe('party keys', () => {
  it('differ across deployments for the same secret', () => {
    // The point of the salt: one person is not linkable across contracts by the
    // key they use in each.
    const a = pureCircuits.derivePartyKeyWith(bytes32(0x01), SELLER_SECRET);
    const b = pureCircuits.derivePartyKeyWith(bytes32(0x02), SELLER_SECRET);
    expect(toHex(a)).not.toBe(toHex(b));
  });

  it('differ between secrets within one deployment', () => {
    const a = pureCircuits.derivePartyKeyWith(INSTANCE_SALT, SELLER_SECRET);
    const b = pureCircuits.derivePartyKeyWith(INSTANCE_SALT, BUYER_SECRET);
    expect(toHex(a)).not.toBe(toHex(b));
  });

  it('are stable for one secret in one deployment, so a track record can accumulate', () => {
    const a = pureCircuits.derivePartyKeyWith(INSTANCE_SALT, SELLER_SECRET);
    const b = pureCircuits.derivePartyKeyWith(INSTANCE_SALT, SELLER_SECRET);
    expect(toHex(a)).toBe(toHex(b));
  });

  it('are what each deployment records for the same seller secret, and differ between them', () => {
    const d1 = deploy(SELLER_SECRET, bytes32(0x0a));
    const d2 = deploy(SELLER_SECRET, bytes32(0x0b));
    const made1 = create(d1, actor(d1, SELLER_SECRET), actor(d1, BUYER_SECRET));
    const made2 = create(d2, actor(d2, SELLER_SECRET), actor(d2, BUYER_SECRET));

    const k1 = led(made1.d).invoiceParties.lookup(made1.invoiceId).sellerKey;
    const k2 = led(made2.d).invoiceParties.lookup(made2.invoiceId).sellerKey;
    expect(toHex(k1)).toBe(toHex(pureCircuits.derivePartyKeyWith(bytes32(0x0a), SELLER_SECRET)));
    expect(toHex(k2)).toBe(toHex(pureCircuits.derivePartyKeyWith(bytes32(0x0b), SELLER_SECRET)));
    expect(toHex(k1)).not.toBe(toHex(k2));
  });
});
