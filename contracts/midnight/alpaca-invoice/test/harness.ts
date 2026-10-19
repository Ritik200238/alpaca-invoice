// Test harness: drives the compiled Alpaca Invoice contract in-process.
//
// SPDX-License-Identifier: Apache-2.0
//
// These tests exercise circuit LOGIC -- state transitions, assertions, the
// disclosure boundary and the token calls -- against the real compiled contract
// through `@midnight-ntwrk/compact-runtime`. No Docker, no node, no proof server,
// no network: a full run finishes in seconds, which is what makes it realistic to
// run them on every commit.
//
// Proof generation is deliberately out of scope here. It needs a proof server and
// is covered by the end-to-end suite against a real network.

import {
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
} from '@midnight-ntwrk/compact-runtime';

import {
  Contract,
  CurrencyFlag,
  ledger,
  pureCircuits,
  type FieldCommitments,
  type InvoiceTerms,
  type Ledger,
  type TaxGroups,
} from '../build/contract/index.js';

import {
  clearActive,
  emptyPrivateState,
  withActive,
  witnesses,
  type AlpacaPrivateState,
} from '../src/witnesses.js';
import { randomBytes32, toHex } from '../src/util.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A Zswap coin public key, as the runtime wants it: 64 hex characters. */
export const COIN_PK = '0'.repeat(64);

/** Deterministic 32-byte value. Readable in failure output, unlike random ones. */
export const bytes32 = (fill: number): Uint8Array => new Uint8Array(32).fill(fill);

export const ZERO32 = new Uint8Array(32);

/** A non-zero instance salt, as the constructor demands. */
export const INSTANCE_SALT = bytes32(0x5a);

export const SELLER_SECRET = bytes32(0x11);
export const BUYER_SECRET = bytes32(0x22);
export const ARBITER_SECRET = bytes32(0x33);
export const STRANGER_SECRET = bytes32(0x44);

/**
 * Where each side of the fixture invoice is paid, as Zswap coin public keys.
 *
 * They go into the terms at creation and every paying circuit compares its
 * recipient against them, so a test that expects a payment to be refused passes a
 * different constant from this set rather than an anonymous byte fill.
 */
export const SELLER_PAYOUT = bytes32(0x77);
export const BUYER_PAYOUT = bytes32(0xb2);
export const STRANGER_PAYOUT = bytes32(0x99);

export const payoutTo = (key: Uint8Array): { readonly bytes: Uint8Array } => ({ bytes: key });

/** The native shielded token's colour. */
export const NATIVE_COLOR = new Uint8Array(32);
export const OTHER_COLOR = bytes32(0xc0);

/** Fixed clock so time-dependent assertions read the same on every machine. */
export const T0 = 1_760_000_000n;
export const DAY = 86_400n;

/** One micro-unit scale, as the application uses: whole yen times 1,000,000. */
export const MICRO = 1_000_000n;

export type ChargedState = Parameters<typeof ledger>[0];

export type Deployed = {
  readonly contract: Contract<AlpacaPrivateState>;
  readonly contractState: ChargedState;
  readonly privateState: AlpacaPrivateState;
};

type CircuitResult = {
  context: {
    currentQueryContext: { state: ChargedState };
    currentPrivateState: AlpacaPrivateState;
  };
};

// ---------------------------------------------------------------------------
// Deployment and execution
// ---------------------------------------------------------------------------

export const deploy = (
  deployerSecret: Uint8Array = SELLER_SECRET,
  salt: Uint8Array = INSTANCE_SALT,
): Deployed => {
  const contract = new Contract<AlpacaPrivateState>(witnesses);
  const privateState = emptyPrivateState(deployerSecret);
  const init = contract.initialState(createConstructorContext(privateState, COIN_PK), salt);
  return {
    contract,
    contractState: init.currentContractState.data,
    privateState: init.currentPrivateState,
  };
};

/** Build a circuit context, optionally as a different actor and at a set time. */
export const ctx = (
  d: Deployed,
  privateState: AlpacaPrivateState = d.privateState,
  time: bigint = T0,
) =>
  createCircuitContext(
    dummyContractAddress(),
    COIN_PK,
    d.contractState,
    privateState,
    undefined,
    undefined,
    Number(time),
  );

/** Fold a circuit result back in so the next call sees the new state. */
export const advance = (d: Deployed, result: CircuitResult): Deployed => ({
  contract: d.contract,
  contractState: result.context.currentQueryContext.state,
  privateState: clearActive(result.context.currentPrivateState),
});

export const led = (d: Deployed): Ledger => ledger(d.contractState);

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

export type Actor = {
  readonly state: AlpacaPrivateState;
  readonly key: Uint8Array;
};

/**
 * Derive a party's key through the contract's own pure circuit rather than
 * recomputing the hash here, so a test can never disagree with the contract about
 * what a party key is.
 */
export const actor = (d: Deployed, secret: Uint8Array): Actor => ({
  state: emptyPrivateState(secret),
  key: pureCircuits.derivePartyKeyWith(led(d).instanceSalt, secret),
});

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

export const NO_GROUPS: TaxGroups = {
  groupA: { rateBps: 0n, netSum: 0n, taxSum: 0n },
  groupB: { rateBps: 0n, netSum: 0n, taxSum: 0n },
};

/**
 * A plain invoice: 100 units at a single 10% rate. Every rule bit R1..R4 holds,
 * and `isJct` is false so the tax groups are not consulted.
 */
export const plainTerms = (overrides: Partial<InvoiceTerms> = {}): InvoiceTerms => ({
  amount: 100n * MICRO,
  taxAmount: 10n * MICRO,
  totalAmount: 110n * MICRO,
  dueDate: T0 + 30n * DAY,
  orderId: bytes32(0xa1),
  currency: bytes32(0xa2),
  itemsHash: bytes32(0xa3),
  memoHash: bytes32(0xa4),
  lineItemsSum: 100n * MICRO,
  expectedTotal: 110n * MICRO,
  taxRateBps: 1000n,
  isJct: false,
  taxGroups: NO_GROUPS,
  jctNumber: 0n,
  currencyFlag: CurrencyFlag.credits,
  sellerPayout: SELLER_PAYOUT,
  buyerPayout: BUYER_PAYOUT,
  ...overrides,
});

/**
 * A qualified invoice with both rate slots in use: 100 units at 10% and 50 at 8%.
 * Net 150, tax 14, total 164.
 */
export const jctTerms = (overrides: Partial<InvoiceTerms> = {}): InvoiceTerms =>
  plainTerms({
    amount: 150n * MICRO,
    taxAmount: 14n * MICRO,
    totalAmount: 164n * MICRO,
    lineItemsSum: 150n * MICRO,
    expectedTotal: 164n * MICRO,
    // Mixed rates have no single rate, so R1 is expected to read false here.
    taxRateBps: 0n,
    isJct: true,
    taxGroups: {
      groupA: { rateBps: 1000n, netSum: 100n * MICRO, taxSum: 10n * MICRO },
      groupB: { rateBps: 800n, netSum: 50n * MICRO, taxSum: 4n * MICRO },
    },
    jctNumber: 1234567890123n,
    ...overrides,
  });

// ---------------------------------------------------------------------------
// Staging and calling
// ---------------------------------------------------------------------------

export const stage = (
  state: AlpacaPrivateState,
  terms: InvoiceTerms,
  nonce: Uint8Array,
  settlementSalt?: Uint8Array,
): AlpacaPrivateState =>
  withActive(state, { terms, nonce, ...(settlementSalt === undefined ? {} : { settlementSalt }) });

export type Created = {
  readonly d: Deployed;
  readonly invoiceId: Uint8Array;
  readonly terms: InvoiceTerms;
  readonly nonce: Uint8Array;
  readonly seller: Actor;
  readonly buyer: Actor;
};

/** Create an invoice from `seller` to `buyer`. */
export const create = (
  d: Deployed,
  seller: Actor,
  buyer: Actor,
  options: {
    terms?: InvoiceTerms;
    nonce?: Uint8Array;
    arbiterKey?: Uint8Array;
    claimedTime?: bigint;
    blockTime?: bigint;
  } = {},
): Created => {
  const terms = options.terms ?? plainTerms();
  const nonce = options.nonce ?? randomBytes32();
  const result = d.contract.impureCircuits.createInvoice(
    ctx(d, stage(seller.state, terms, nonce), options.blockTime ?? T0),
    buyer.key,
    options.arbiterKey ?? ZERO32,
    options.claimedTime ?? T0,
  );
  return { d: advance(d, result), invoiceId: result.result, terms, nonce, seller, buyer };
};

/** Assert a call throws, and that the message names the expected cause. */
export const expectThrows = (fn: () => unknown, fragment: string): Error => {
  try {
    fn();
  } catch (error) {
    const err = error as Error;
    if (!err.message.includes(fragment)) {
      throw new Error(`expected an error mentioning "${fragment}", got: ${err.message}`);
    }
    return err;
  }
  throw new Error(`expected a failure mentioning "${fragment}", but the call succeeded`);
};

export const coin = (value: bigint, color: Uint8Array = NATIVE_COLOR) => ({
  nonce: randomBytes32(),
  color,
  value,
});

/** Everything the ledger holds about one invoice, flattened to text. */
export const publicRecord = (d: Deployed, invoiceId: Uint8Array): string => {
  const l = led(d);
  const pieces = [
    l.invoiceRegistry.lookup(invoiceId),
    l.invoiceStatus.lookup(invoiceId),
    l.invoiceParties.lookup(invoiceId),
    l.invoiceCommitment.lookup(invoiceId),
    l.invoiceFieldCommitments.lookup(invoiceId),
    l.invoiceRulesResult.lookup(invoiceId),
    l.invoiceTaxTag.lookup(invoiceId),
    l.invoiceJctReg.lookup(invoiceId),
    l.invoiceArbiter.lookup(invoiceId),
  ];
  return JSON.stringify(pieces, (_k, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Uint8Array) return toHex(v);
    return v;
  });
};

export type { FieldCommitments, InvoiceTerms };
