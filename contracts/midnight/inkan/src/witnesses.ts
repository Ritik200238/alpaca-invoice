// Inkan private state and witness implementations.
//
// SPDX-License-Identifier: Apache-2.0
//
// This module is the trust boundary. Everything here runs on the prover's own
// machine and nothing it returns is ever placed in a transaction: the circuits
// publish only hiding commitments derived from these values.
//
// A circuit cannot tell a real secret from an unset one -- a commitment to
// thirty-two zero bytes is a perfectly valid commitment -- so the guards that
// stop a caller from publishing a digest anyone can recompute live on this side.
// Every accessor validates before it hands a value to a circuit.

import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';

import type { InvoiceTerms, Ledger } from '../build/contract/index.js';
import { isZero } from './util.js';

/** Width of every secret, salt and digest this contract handles. */
export const SECRET_BYTES = 32;

/**
 * The openings for the one invoice a circuit call is about.
 *
 * Witnesses cannot see circuit arguments, so the openings are staged in private
 * state before a call and cleared after it. A stale staged invoice makes the next
 * call prove against the wrong openings, which surfaces as an assertion inside a
 * circuit that names nothing useful.
 */
export type ActiveInvoice = {
  readonly terms: InvoiceTerms;
  readonly nonce: Uint8Array;
  /** Only the payer needs this; it blinds the settlement anchor. */
  readonly settlementSalt?: Uint8Array;
};

export type InkanPrivateState = {
  /** The user's root secret. Every identity the contract recognises derives from it. */
  readonly secret: Uint8Array;
  readonly active?: ActiveInvoice;
};

export const emptyPrivateState = (secret: Uint8Array): InkanPrivateState => ({ secret });

export const withActive = (s: InkanPrivateState, active: ActiveInvoice): InkanPrivateState => ({
  ...s,
  active,
});

export const clearActive = (s: InkanPrivateState): InkanPrivateState => ({ secret: s.secret });

const need32 = (bytes: Uint8Array, what: string): Uint8Array => {
  if (bytes.length !== SECRET_BYTES) {
    throw new Error(`inkan: ${what} must be ${SECRET_BYTES} bytes, not ${bytes.length}`);
  }
  if (isZero(bytes)) {
    throw new Error(`inkan: ${what} is all zeros, so every commitment made with it could be recomputed`);
  }
  return bytes;
};

const active = (s: InkanPrivateState, what: string): ActiveInvoice => {
  if (s.active === undefined) {
    throw new Error(`inkan: no invoice is staged, so there is nothing to supply as ${what}`);
  }
  return s.active;
};

type Ctx = WitnessContext<Ledger, InkanPrivateState>;

export const witnesses = {
  localSecret: ({ privateState }: Ctx): [InkanPrivateState, Uint8Array] => [
    privateState,
    need32(privateState.secret, 'the local secret'),
  ],

  invoiceTerms: ({ privateState }: Ctx): [InkanPrivateState, InvoiceTerms] => [
    privateState,
    active(privateState, 'the invoice terms').terms,
  ],

  invoiceNonce: ({ privateState }: Ctx): [InkanPrivateState, Uint8Array] => [
    privateState,
    need32(active(privateState, 'the invoice nonce').nonce, 'the invoice nonce'),
  ],

  settlementSalt: ({ privateState }: Ctx): [InkanPrivateState, Uint8Array] => {
    const salt = active(privateState, 'the settlement salt').settlementSalt;
    if (salt === undefined) {
      throw new Error('inkan: this call needs a settlement salt and none was staged');
    }
    return [privateState, need32(salt, 'the settlement salt')];
  },
};
