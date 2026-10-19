// The business flow run against a deployed Alpaca Invoice contract.
//
// SPDX-License-Identifier: Apache-2.0
//
// Kept apart from `preview-deploy.ts` on purpose. A wallet's first scan of a public
// chain takes the better part of an hour, so the process that holds the synced
// wallet stays alive and loads this file each time it is asked to, instead of
// scanning again for every correction. The flow can be fixed and re-run in
// seconds; the wallet is the expensive part.
//
// Each run starts from a fresh seller and buyer secret, so a run that failed
// part-way leaves nothing behind that the next run has to step around.

import fs from 'node:fs';
import path from 'node:path';
import * as Rx from 'rxjs';

import { encodeCoinPublicKey } from '@midnight-ntwrk/compact-runtime';
import { ttlOneHour } from '@midnight-ntwrk/midnight-js-utils';
import type { FinalizedTxData } from '@midnight-ntwrk/midnight-js-types';

import {
  CurrencyFlag,
  InvoiceStatus,
  emptyPrivateState,
  ledger,
  pureCircuits,
  withActive,
  type InvoiceTerms,
} from '../src/index.js';
import { randomBytes32, toHex } from '../src/util.js';
import { addressesOf, type WalletContext } from './lib/wallet.js';

/** What the host process hands to a run. */
export type Session = {
  ctx: WalletContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providers: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deployed: any;
  address: string;
  walletProvider: { getCoinPublicKey(): string };
  deployReceipt: FinalizedTxData;
  night: string;
  payer: string;
  indexer: string;
  startedAt: string;
  repoRoot: string;
  logger: { info(m: string): void; warn(m: string): void; error(m: string): void };
};

type Receipt = {
  step: string;
  circuit: string;
  txHash: string;
  txId: string;
  blockHeight: number;
  blockTimestamp: string;
  status: string;
  effect: string;
  /** Pages where anyone can look this transaction up without trusting us. */
  explorers: { explorer: string; url: string }[];
};

// Explorer URL shapes were checked by hand against a real Preview transaction on
// 2026-10-19: Midnight Explorer serves /transactions/<hash> (and 404s /tx/),
// Subscan serves /tx/<hash>, and 1am routes /tx/:txHash and /contract/:addr.
const explorerLinks = (txHash: string) => [
  { explorer: 'Midnight Explorer', url: `https://preview.midnightexplorer.com/transactions/${txHash}` },
  { explorer: 'Subscan', url: `https://midnight-preview.subscan.io/tx/${txHash}` },
  { explorer: '1am', url: `https://explorer.1am.xyz/tx/${txHash}?network=preview` },
];

const assertOk = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`alpaca: ${message}`);
};

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));

/**
 * A timestamp the chain will corroborate. The contract refuses a claim ahead of the
 * block and one more than an hour behind it; this machine's clock and the chain's
 * can differ by seconds, so the claim leans safely into the past.
 */
const claimedNow = (): bigint => nowSeconds() - 90n;

const MICRO = 1_000_000n;

/** A qualified invoice with both rate slots in use: 10 at 10% and 5 at 8%. */
const sampleTerms = (payoutKey: Uint8Array): InvoiceTerms => ({
  amount: 15n * MICRO,
  taxAmount: 1_400_000n,
  totalAmount: 16_400_000n,
  dueDate: nowSeconds() + 30n * 86_400n,
  orderId: randomBytes32(),
  currency: new Uint8Array(32).fill(0x4a), // stands in for the digest of "JPY"
  itemsHash: randomBytes32(),
  memoHash: randomBytes32(),
  lineItemsSum: 15n * MICRO,
  expectedTotal: 16_400_000n,
  taxRateBps: 0n, // mixed rates have no single rate, so R1 reads false by design
  isJct: true,
  taxGroups: {
    groupA: { rateBps: 1000n, netSum: 10n * MICRO, taxSum: 1n * MICRO },
    groupB: { rateBps: 800n, netSum: 5n * MICRO, taxSum: 400_000n },
  },
  jctNumber: 1234567890123n,
  currencyFlag: CurrencyFlag.credits,
  sellerPayout: payoutKey,
  buyerPayout: payoutKey,
});

const publicText = (value: unknown): string =>
  JSON.stringify(value, (_k, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Uint8Array) return toHex(v);
    return v;
  });

export default async function runFlow(s: Session): Promise<void> {
  const { ctx, providers, deployed, address, logger, night } = s;
  const receipts: Receipt[] = [];
  let paid = false;
  let payNote = '';

  const writeReceipts = (): void => {
    const out = {
      schemaVersion: '1',
      title: 'Alpaca Invoice on Midnight Preview',
      network: 'preview',
      startedAt: s.startedAt,
      updatedAt: new Date().toISOString(),
      contractAddress: address,
      contractExplorers: [{ explorer: '1am', url: `https://explorer.1am.xyz/contract/${address}?network=preview` }],
      payer: s.payer,
      indexer: s.indexer,
      contract: {
        source: 'contracts/midnight/alpaca-invoice/src/alpaca-invoice.compact',
        language: 'Compact 0.23',
        toolchain: '0.31.1',
      },
      steps: receipts,
      notRun: paid || payNote === '' ? [] : [{ step: 'pay', reason: payNote }],
      note:
        'Every effect above was read back through the public indexer after the transaction landed, ' +
        'not taken from the local result of the call. The privacy checks search the state the indexer ' +
        'served for the invoice figures and fail the run if any appears. Both parties are one wallet ' +
        'with two different secrets, so authorisation is tested here and payee binding is not; the ' +
        'in-process suite covers payee binding with distinct keys.',
    };
    const dir = path.resolve(s.repoRoot, 'docs', 'receipts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'preview.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  };

  /**
   * Record a transaction. `effect` is written by the caller only after it has
   * re-read the state through the indexer, so a line in the receipt file is a claim
   * about the chain and not about what this process believed it had done. Written
   * after every step, so a failure part-way keeps the transactions that landed.
   */
  const record = (step: string, circuit: string, tx: FinalizedTxData, effect: string): void => {
    receipts.push({
      step,
      circuit,
      txHash: tx.txHash,
      txId: tx.txId,
      blockHeight: tx.blockHeight,
      blockTimestamp: new Date(tx.blockTimestamp).toISOString(),
      status: String(tx.status),
      effect,
      explorers: explorerLinks(tx.txHash),
    });
    logger.info(`${step}: ${tx.txHash} in block ${tx.blockHeight} -- ${effect}`);
    writeReceipts();
  };

  const readLedger = async () => {
    const state = await providers.publicDataProvider.queryContractState(address);
    assertOk(state !== null, 'the indexer does not know this contract');
    return ledger(state.data);
  };

  // The salt is read from the ledger rather than remembered, so a joined contract
  // and a fresh one are handled the same way.
  const instanceSalt = (await readLedger()).instanceSalt;
  assertOk(instanceSalt.length === 32 && !instanceSalt.every((b: number) => b === 0), 'the ledger holds no instance salt');
  record('deploy', 'constructor', s.deployReceipt, `contract live at ${address}; instance salt on the ledger`);

  const sellerSecret = randomBytes32();
  const buyerSecret = randomBytes32();
  const sellerKey = pureCircuits.derivePartyKeyWith(instanceSalt, sellerSecret);
  const buyerKey = pureCircuits.derivePartyKeyWith(instanceSalt, buyerSecret);
  const payoutKey = encodeCoinPublicKey(s.walletProvider.getCoinPublicKey());

  // Circuits read their openings from private state rather than taking them as
  // arguments, so they are staged before a call and cleared after it.
  const asParty = async <T>(
    secret: Uint8Array,
    opening: { terms: InvoiceTerms; nonce: Uint8Array; settlementSalt?: Uint8Array } | undefined,
    body: () => Promise<T>,
  ): Promise<T> => {
    const base = emptyPrivateState(secret);
    await providers.privateStateProvider.set('alpacaPrivateState', opening === undefined ? base : withActive(base, opening));
    try {
      return await body();
    } finally {
      await providers.privateStateProvider.set('alpacaPrivateState', emptyPrivateState(secret));
    }
  };

  type Called = { public: FinalizedTxData };

  // ---- 1. create an invoice ----------------------------------------------------
  const terms = sampleTerms(payoutKey);
  const nonce = randomBytes32();
  const invoiceId = pureCircuits.deriveInvoiceId(sellerKey, nonce);

  logger.info('creating a qualified invoice');
  const created = await asParty<Called>(sellerSecret, { terms, nonce }, () =>
    deployed.callTx.createInvoice(buyerKey, new Uint8Array(32), claimedNow()),
  );
  {
    const l = await readLedger();
    assertOk(l.invoiceStatus.member(invoiceId), 'the invoice is not on the ledger');
    assertOk(l.invoiceStatus.lookup(invoiceId) === InvoiceStatus.pending, 'status is not pending');
    assertOk(l.invoiceCount.lookup(sellerKey) === 1n, 'the seller invoice count did not advance');
    const frame = { sellerKey, buyerKey, terms };
    assertOk(
      toHex(l.invoiceRegistry.lookup(invoiceId)) === toHex(pureCircuits.computeInvoiceHash(frame, nonce)),
      'the recorded invoice hash is not the one the terms produce',
    );
    // The claim the product rests on, checked against what the indexer served.
    const served = publicText([
      l.invoiceRegistry.lookup(invoiceId),
      l.invoiceStatus.lookup(invoiceId),
      l.invoiceParties.lookup(invoiceId),
      l.invoiceCommitment.lookup(invoiceId),
      l.invoiceFieldCommitments.lookup(invoiceId),
      l.invoiceRulesResult.lookup(invoiceId),
      l.invoiceTaxTag.lookup(invoiceId),
      l.invoiceJctReg.lookup(invoiceId),
    ]);
    for (const figure of [terms.amount, terms.taxAmount, terms.totalAmount, terms.dueDate]) {
      assertOk(!served.includes(figure.toString()), `a private figure (${figure}) appears in public state`);
    }
    record(
      'create',
      'createInvoice',
      created.public,
      `invoice ${toHex(invoiceId).slice(0, 16)}… status pending; 11 field commitments, tax tag and ` +
        'registration digest recorded; no amount, tax, total or due date in the served state',
    );
  }

  // ---- 2. authorise an auditor -------------------------------------------------
  logger.info('authorising an auditor to see amount and tax');
  const auditKeyHash = randomBytes32();
  const scopes = [true, true, false, false, false, false, false, false, false];
  const audited = await asParty<Called>(sellerSecret, undefined, () =>
    deployed.callTx.setAuditAuthorization(invoiceId, auditKeyHash, scopes as never, nowSeconds() + 7n * 86_400n, claimedNow()),
  );
  {
    const l = await readLedger();
    const a = l.auditAuthorization.lookup(invoiceId);
    assertOk(toHex(a.auditKeyHash) === toHex(auditKeyHash), 'audit key hash mismatch');
    assertOk(a.scopes[0] === true && a.scopes[1] === true && a.scopes[2] === false, 'scopes mismatch');
    record(
      'audit',
      'setAuditAuthorization',
      audited.public,
      'authorization recorded for amount and tax; only the hash of the audit key reaches the chain',
    );
  }

  // ---- 3. a second invoice, cancelled ------------------------------------------
  // Before the payment on purpose: it needs no coin, so it cannot be held up by
  // the step most likely to need attention.
  logger.info('creating and cancelling a second invoice');
  const terms2 = sampleTerms(payoutKey);
  const nonce2 = randomBytes32();
  const invoiceId2 = pureCircuits.deriveInvoiceId(sellerKey, nonce2);
  await asParty<Called>(sellerSecret, { terms: terms2, nonce: nonce2 }, () =>
    deployed.callTx.createInvoice(buyerKey, new Uint8Array(32), claimedNow()),
  );
  const before = (await readLedger()).auditCounter.lookup(sellerKey);
  const cancelled = await asParty<Called>(sellerSecret, undefined, () => deployed.callTx.cancelInvoice(invoiceId2));
  {
    const l = await readLedger();
    assertOk(l.invoiceStatus.lookup(invoiceId2) === InvoiceStatus.cancelled, 'status is not cancelled');
    assertOk(l.auditCounter.lookup(sellerKey) === before - 1n, 'the audit counter did not drop');
    record('cancel', 'cancelInvoice', cancelled.public, `status pending -> cancelled; seller audit counter ${before} -> ${before - 1n}`);
  }

  // ---- 4. pay the first invoice ------------------------------------------------
  // Settlement moves a SHIELDED coin, and the faucet pays unshielded NIGHT. If the
  // wallet holds no shielded NIGHT, try to shield some first, and say plainly if
  // that cannot be done rather than skipping the step quietly.
  const shieldedNow = async () => (await Rx.firstValueFrom(ctx.wallet.state())).shielded?.balances[night] ?? 0n;
  if ((await shieldedNow()) < terms.totalAmount) {
    logger.info(`shielded NIGHT ${await shieldedNow()} is below the invoice total ${terms.totalAmount}; shielding some`);
    try {
      const { shielded } = await addressesOf(ctx);
      const recipe = await ctx.wallet.transferTransaction(
        [{ type: 'shielded', outputs: [{ type: night, receiverAddress: shielded, amount: terms.totalAmount * 2n }] }],
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttlOneHour(), payFees: true },
      );
      const signed = await ctx.wallet.signRecipe(recipe, (payload) => ctx.unshieldedKeystore.signData(payload));
      const id = await ctx.wallet.submitTransaction(await ctx.wallet.finalizeRecipe(signed));
      logger.info(`shielding transaction ${id}`);
      await Rx.firstValueFrom(
        ctx.wallet.state().pipe(Rx.filter((st) => (st.shielded?.balances[night] ?? 0n) >= terms.totalAmount), Rx.timeout(600_000)),
      );
    } catch (error) {
      payNote = `could not obtain shielded NIGHT: ${error instanceof Error ? error.message : String(error)}`;
      logger.warn(payNote);
    }
  }

  if ((await shieldedNow()) >= terms.totalAmount) {
    logger.info('paying: the buyer settles in shielded NIGHT');
    const settlementSalt = randomBytes32();
    // The native token's colour is thirty-two zero bytes.
    const payment = { nonce: randomBytes32(), color: new Uint8Array(32), value: terms.totalAmount };
    try {
      const pay = await asParty<Called>(buyerSecret, { terms, nonce, settlementSalt }, () =>
        deployed.callTx.payInvoiceShielded(invoiceId, payment, { bytes: payoutKey }, claimedNow()),
      );
      const l = await readLedger();
      assertOk(l.invoiceStatus.lookup(invoiceId) === InvoiceStatus.paid, 'status is not paid');
      const anchor = pureCircuits.computePaymentAnchor(invoiceId, terms.totalAmount, settlementSalt);
      assertOk(l.paymentCommitments.member(anchor), 'the payment anchor is not on the ledger');
      assertOk(!publicText(l.paymentCommitments).includes(terms.totalAmount.toString()), 'the paid amount appears in public state');
      paid = true;
      record(
        'pay',
        'payInvoiceShielded',
        pay.public,
        'status pending -> paid; a shielded coin moved buyer -> seller inside the same transaction; ' +
          'the settlement anchor is recorded and the amount appears nowhere in public state',
      );
    } catch (error) {
      payNote = `the payment transaction failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(payNote);
    }
  } else if (payNote === '') {
    payNote = 'the wallet holds too little shielded NIGHT to settle';
  }

  writeReceipts();
  logger.info(`wrote docs/receipts/preview.json with ${receipts.length} transactions${paid ? '' : ' (the payment step did not run)'}`);
}
