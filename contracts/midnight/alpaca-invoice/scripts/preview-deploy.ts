// Deploy Alpaca Invoice to Midnight Preview and write down what the chain did.
//
// SPDX-License-Identifier: Apache-2.0
//
// Tests that run in process prove the rules. They prove nothing to a reader who
// will not clone this repository, so this script does the other half: it deploys
// the real contract to a public network, runs the business flow against it, and
// writes `docs/receipts/preview.json` -- one entry per transaction with the
// circuit called, the transaction hash, the block, three public explorer links,
// and the state change read back through the public indexer rather than taken
// from the local result of the call.
//
//   ALPACA_SEED_FILE=<path outside this repo> npm run preview:deploy
//
// Set ALPACA_CHECK_ONLY=1 to sync the wallet, print its balances and stop.
//
// The seed is read from ALPACA_SEED or from the file named by ALPACA_SEED_FILE.
// It is never printed and is refused if it sits inside this repository: a funded
// seed on a public network is a key.
//
// Both parties here are one wallet with two different secrets. That is a real
// test of the contract's authorisation rules (the buyer and the seller are
// different party keys and cannot act as each other) and a poor test of where
// money ends up, because a payment from you to you looks the same whoever the
// payee is. The in-process suite covers the payee rules with distinct keys.

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import * as Rx from 'rxjs';

import { encodeCoinPublicKey } from '@midnight-ntwrk/compact-runtime';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { nativeToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { FinalizedTxData } from '@midnight-ntwrk/midnight-js-types';
import { ttlOneHour } from '@midnight-ntwrk/midnight-js-utils';
import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
import { UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';

import {
  CurrencyFlag,
  InvoiceStatus,
  compiledAlpacaContract,
  emptyPrivateState,
  ledger,
  pureCircuits,
  withActive,
  type AlpacaPrivateState,
  type InvoiceTerms,
} from '../src/index.js';
import { randomBytes32, toHex } from '../src/util.js';
import {
  E2EWalletProvider,
  addressesOf,
  buildWallet,
  registerForDust,
  waitForSync,
  type WalletContext,
} from './lib/wallet.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '..', '..', '..');

/**
 * Where the full compile (proving and verifying keys) lives. The fast compile
 * used by the tests has no keys, so deploying from it would fail to prove.
 */
const ZK_DIR = 'build-zk';

// Preview endpoints, from the networks guide in the Midnight docs
// (docs/guides/networks-and-environments.mdx, "Environment reference").
// Preview is Midnight-hosted and needs no token.
const PREVIEW: EnvironmentConfiguration = {
  walletNetworkId: 'preview',
  networkId: 'preview',
  indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preview.midnight.network',
  nodeWS: 'wss://rpc.preview.midnight.network',
  faucet: 'https://midnight-tmnight-preview.nethermind.dev/',
  proofServer: process.env.ALPACA_PROOF_SERVER ?? 'http://127.0.0.1:6300',
};

const logger = pino({
  level: process.env.ALPACA_LOG_LEVEL ?? 'info',
  transport: { target: 'pino-pretty', options: { colorize: false, translateTime: 'HH:MM:ss' } },
});

// Explorer URL shapes were checked by hand against a real Preview transaction on
// 2026-10-19: Midnight Explorer serves /transactions/<hash> (and 404s /tx/),
// Subscan serves /tx/<hash>, and 1am routes /tx/:txHash and /contract/:addr.
const explorerLinks = (txHash: string) => [
  { explorer: 'Midnight Explorer', url: `https://preview.midnightexplorer.com/transactions/${txHash}` },
  { explorer: 'Subscan', url: `https://midnight-preview.subscan.io/tx/${txHash}` },
  { explorer: '1am', url: `https://explorer.1am.xyz/tx/${txHash}?network=preview` },
];

type Receipt = {
  step: string;
  circuit: string;
  txHash: string;
  txId: string;
  blockHeight: number;
  blockTimestamp: string;
  status: string;
  effect: string;
  explorers: { explorer: string; url: string }[];
};

const receipts: Receipt[] = [];

/**
 * Record a transaction. `effect` is written by the caller only after it has
 * re-read the state through the indexer, so a line in the receipt file is a claim
 * about the chain and not about what this process believed it had done.
 */
let writeReceipts: () => void = () => undefined;

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
  // After every step, not only at the end: a failure part-way must not lose the
  // transactions that already landed.
  writeReceipts();
};

/**
 * Read a transaction back from the public indexer by hash.
 *
 * Used when joining a contract that an earlier run deployed: that run's own
 * result is gone, and the chain is the better source for its receipt anyway.
 */
const fetchTransaction = async (txHash: string): Promise<FinalizedTxData> => {
  const response = await fetch(PREVIEW.indexer, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `{ transactions(offset:{hash:"${txHash}"}) { hash transactionResult { status } block { height timestamp } } }`,
    }),
  });
  const body = (await response.json()) as {
    data?: { transactions?: { hash: string; transactionResult?: { status: string }; block: { height: number; timestamp: number } }[] };
  };
  const t = body.data?.transactions?.[0];
  if (t === undefined) throw new Error(`alpaca: the indexer does not know transaction ${txHash}`);
  return {
    txHash: t.hash,
    txId: t.hash,
    blockHeight: t.block.height,
    blockTimestamp: t.block.timestamp,
    status: t.transactionResult?.status ?? 'UNKNOWN',
  } as unknown as FinalizedTxData;
};

const resolveSeed = (): string => {
  const fromEnv = process.env.ALPACA_SEED?.trim();
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  const file = process.env.ALPACA_SEED_FILE?.trim();
  if (file === undefined || file === '') {
    throw new Error('alpaca: set ALPACA_SEED_FILE to the funded wallet seed (a file outside this repository).');
  }
  const resolved = path.resolve(file);
  const relative = path.relative(REPO_ROOT, resolved);
  if (relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    throw new Error(`alpaca: refusing to read a funded seed from inside the repository (${resolved}).`);
  }
  const seed = fs.readFileSync(resolved, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/i.test(seed)) {
    throw new Error(`alpaca: ${file} does not hold a 32-byte hex seed.`);
  }
  return seed;
};

const assertOk = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`alpaca: ${message}`);
};

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));

/**
 * A timestamp the chain will corroborate. The contract refuses a claim ahead of
 * the block and one more than an hour behind it; this machine's clock and the
 * chain's can differ by seconds, so the claim leans safely into the past.
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

const main = async (): Promise<void> => {
  setNetworkId('preview');
  const startedAt = new Date().toISOString();

  const ctx: WalletContext = await buildWallet(PREVIEW, resolveSeed());
  const { unshielded } = await addressesOf(ctx);
  const payer = UnshieldedAddress.codec.encode('preview', unshielded).toString();
  logger.info(`network preview, paying from ${payer}`);

  // The first scan of a public chain is far slower than a local node, and a
  // transaction cannot be balanced until all three sub-wallets have caught up.
  await waitForSync(ctx, logger, 3_600_000);

  const night = nativeToken().raw;
  const state = await Rx.firstValueFrom(ctx.wallet.state());
  const unshieldedNight = state.unshielded?.balances[night] ?? 0n;
  const shieldedNight = state.shielded?.balances[night] ?? 0n;
  logger.info(`NIGHT balance: unshielded ${unshieldedNight}, shielded ${shieldedNight}`);
  if (process.env.ALPACA_CHECK_ONLY === '1') {
    await ctx.wallet.stop().catch(() => undefined);
    return;
  }
  assertOk(unshieldedNight + shieldedNight > 0n, `the wallet holds no NIGHT. Fund ${payer} first.`);

  await registerForDust(ctx, logger);

  const walletProvider = new E2EWalletProvider(ctx, logger);
  const zkConfigProvider = new NodeZkConfigProvider<string>(path.resolve(PACKAGE_ROOT, ZK_DIR));
  const compiled = compiledAlpacaContract(`../${ZK_DIR}`);

  const providers = {
    privateStateProvider: levelPrivateStateProvider<'alpacaPrivateState', AlpacaPrivateState>({
      privateStateStoreName: 'alpaca-preview-private-state',
      signingKeyStoreName: 'alpaca-preview-signing-keys',
      privateStoragePasswordProvider: () => 'Alpaca-preview-deploy-1',
      accountId: randomBytes(16).toString('hex'),
    }),
    publicDataProvider: indexerPublicDataProvider(PREVIEW.indexer, PREVIEW.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(PREVIEW.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const sellerSecret = randomBytes32();
  const buyerSecret = randomBytes32();

  // Join a contract an earlier run deployed, or deploy a new one. Joining exists
  // because a run can fail after the deploy has landed, and a wallet's first scan
  // of the public chain takes most of an hour; redoing the deploy to retry the
  // rest would be both slow and a second contract nobody asked for.
  const existing = process.env.ALPACA_CONTRACT_ADDRESS?.trim();
  const existingDeployTx = process.env.ALPACA_DEPLOY_TX?.trim();
  let deployed: any;
  let address: string;
  let deployReceipt: FinalizedTxData;
  if (existing !== undefined && existing !== '') {
    assertOk(existingDeployTx !== undefined && existingDeployTx !== '', 'ALPACA_DEPLOY_TX is needed to join, so the deploy receipt can be read from the chain');
    address = existing;
    providers.privateStateProvider.setContractAddress(address);
    deployed = await findDeployedContract(providers, {
      compiledContract: compiled,
      contractAddress: address,
      privateStateId: 'alpacaPrivateState',
      initialPrivateState: emptyPrivateState(sellerSecret),
    });
    deployReceipt = await fetchTransaction(existingDeployTx!);
    logger.info(`joined contract ${address}`);
  } else {
    logger.info('deploying (this builds real proofs and takes a while)');
    deployed = await deployContract(providers, {
      compiledContract: compiled,
      privateStateId: 'alpacaPrivateState',
      initialPrivateState: emptyPrivateState(sellerSecret),
      args: [randomBytes32()],
    });
    address = deployed.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(address);
    deployReceipt = deployed.deployTxData.public;
    logger.info(`contract address ${address}`);
  }

  const readLedger = async () => {
    const s = await providers.publicDataProvider.queryContractState(address);
    assertOk(s !== null, 'the indexer does not know this contract');
    return ledger(s.data);
  };

  let paid = false;
  let payNote = '';
  const dir = path.resolve(REPO_ROOT, 'docs', 'receipts');
  writeReceipts = () => {
    const out = {
      schemaVersion: '1',
      title: 'Alpaca Invoice on Midnight Preview',
      network: 'preview',
      startedAt,
      updatedAt: new Date().toISOString(),
      contractAddress: address,
      contractExplorers: [
        { explorer: '1am', url: `https://explorer.1am.xyz/contract/${address}?network=preview` },
      ],
      payer,
      indexer: PREVIEW.indexer,
      contract: {
        source: 'contracts/midnight/alpaca-invoice/src/alpaca-invoice.compact',
        language: 'Compact 0.23',
        toolchain: '0.31.1',
      },
      steps: receipts,
      notRun: paid ? [] : payNote === '' ? [] : [{ step: 'pay', reason: payNote }],
      note:
        'Every effect above was read back through the public indexer after the transaction landed, ' +
        'not taken from the local result of the call. The privacy checks search the state the indexer ' +
        'served for the invoice figures and fail the run if any appears. Both parties are one wallet ' +
        'with two different secrets, so authorisation is tested here and payee binding is not; the ' +
        'in-process suite covers payee binding with distinct keys.',
    };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'preview.json'), `${JSON.stringify(out, null, 2)}
`, 'utf8');
  };

  // The salt is read from the ledger rather than remembered, so a joined contract
  // and a fresh one are handled the same way.
  const instanceSalt = (await readLedger()).instanceSalt;
  assertOk(instanceSalt.length === 32 && !instanceSalt.every((b) => b === 0), 'the ledger holds no instance salt');
  record('deploy', 'constructor', deployReceipt, `contract live at ${address}; instance salt on the ledger`);

  const sellerKey = pureCircuits.derivePartyKeyWith(instanceSalt, sellerSecret);
  const buyerKey = pureCircuits.derivePartyKeyWith(instanceSalt, buyerSecret);
  const payoutKey = encodeCoinPublicKey(walletProvider.getCoinPublicKey());

  // Circuits read their openings from private state rather than taking them as
  // arguments, so they are staged before a call and cleared after it.
  const asParty = async <T>(
    secret: Uint8Array,
    opening: { terms: InvoiceTerms; nonce: Uint8Array; settlementSalt?: Uint8Array } | undefined,
    body: () => Promise<T>,
  ): Promise<T> => {
    const base = emptyPrivateState(secret);
    await providers.privateStateProvider.set(
      'alpacaPrivateState',
      opening === undefined ? base : withActive(base, opening),
    );
    try {
      return await body();
    } finally {
      await providers.privateStateProvider.set('alpacaPrivateState', emptyPrivateState(secret));
    }
  };

  const publicText = (value: unknown): string =>
    JSON.stringify(value, (_k, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (v instanceof Uint8Array) return toHex(v);
      return v;
    });

  // ---- 1. create an invoice -------------------------------------------------
  const terms = sampleTerms(payoutKey);
  const nonce = randomBytes32();
  const invoiceId = pureCircuits.deriveInvoiceId(sellerKey, nonce);

  logger.info('creating a qualified invoice');
  const created = await asParty<{ public: FinalizedTxData }>(sellerSecret, { terms, nonce }, () =>
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
    for (const secret of [terms.amount, terms.taxAmount, terms.totalAmount, terms.dueDate]) {
      assertOk(!served.includes(secret.toString()), `a private figure (${secret}) appears in public state`);
    }
    record(
      'create',
      'createInvoice',
      created.public,
      `invoice ${toHex(invoiceId).slice(0, 16)}… status pending; 11 field commitments, tax tag and ` +
        'registration digest recorded; no amount, tax, total or due date in the served state',
    );
  }

  // ---- 2. authorise an auditor ----------------------------------------------
  logger.info('authorising an auditor to see amount and tax');
  const auditKeyHash = randomBytes32();
  const scopes = [true, true, false, false, false, false, false, false, false];
  const audited = await asParty<{ public: FinalizedTxData }>(sellerSecret, undefined, () =>
    deployed.callTx.setAuditAuthorization(
      invoiceId,
      auditKeyHash,
      scopes as never,
      nowSeconds() + 7n * 86_400n,
      claimedNow(),
    ),
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

  // ---- 3. pay it ------------------------------------------------------------
  // Settlement moves a SHIELDED coin, and the faucet pays unshielded NIGHT. If the
  // wallet holds no shielded NIGHT, try to shield some first, and say plainly if
  // that cannot be done rather than skipping the step quietly.
  {
    const have = (await Rx.firstValueFrom(ctx.wallet.state())).shielded?.balances[night] ?? 0n;
    if (have < terms.totalAmount) {
      logger.info(`shielded NIGHT ${have} is below the invoice total ${terms.totalAmount}; shielding some`);
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
          ctx.wallet.state().pipe(Rx.filter((s) => (s.shielded?.balances[night] ?? 0n) >= terms.totalAmount), Rx.timeout(600_000)),
        );
      } catch (error) {
        payNote = `could not obtain shielded NIGHT: ${error instanceof Error ? error.message : String(error)}`;
        logger.warn(payNote);
      }
    }
    const now = (await Rx.firstValueFrom(ctx.wallet.state())).shielded?.balances[night] ?? 0n;
    if (now >= terms.totalAmount) {
      logger.info('paying: the buyer settles in shielded NIGHT');
      const settlementSalt = randomBytes32();
      // The native token's colour is thirty-two zero bytes.
      const payment = { nonce: randomBytes32(), color: new Uint8Array(32), value: terms.totalAmount };
      let pay: { public: FinalizedTxData } | undefined;
      try {
        pay = await asParty(buyerSecret, { terms, nonce, settlementSalt }, () =>
          deployed.callTx.payInvoiceShielded(invoiceId, payment, { bytes: payoutKey }, claimedNow()),
        );
      } catch (error) {
        payNote = `the payment transaction failed: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(payNote);
      }
      if (pay !== undefined) {
      const l = await readLedger();
      assertOk(l.invoiceStatus.lookup(invoiceId) === InvoiceStatus.paid, 'status is not paid');
      const anchor = pureCircuits.computePaymentAnchor(invoiceId, terms.totalAmount, settlementSalt);
      assertOk(l.paymentCommitments.member(anchor), 'the payment anchor is not on the ledger');
      assertOk(
        !publicText(l.paymentCommitments).includes(terms.totalAmount.toString()),
        'the paid amount appears in public state',
      );
      record(
        'pay',
        'payInvoiceShielded',
        pay.public,
        'status pending -> paid; a shielded coin moved buyer -> seller inside the same transaction; ' +
          'the settlement anchor is recorded and the amount appears nowhere in public state',
      );
      paid = true;
      }
    } else if (payNote === '') {
      payNote = 'the wallet holds too little shielded NIGHT to settle';
    }
  }

  // ---- 4. a second invoice, cancelled ---------------------------------------
  logger.info('creating and cancelling a second invoice');
  const terms2 = sampleTerms(payoutKey);
  const nonce2 = randomBytes32();
  const invoiceId2 = pureCircuits.deriveInvoiceId(sellerKey, nonce2);
  await asParty(sellerSecret, { terms: terms2, nonce: nonce2 }, () =>
    deployed.callTx.createInvoice(buyerKey, new Uint8Array(32), claimedNow()),
  );
  const before = (await readLedger()).auditCounter.lookup(sellerKey);
  const cancelled = await asParty<{ public: FinalizedTxData }>(sellerSecret, undefined, () => deployed.callTx.cancelInvoice(invoiceId2));
  {
    const l = await readLedger();
    assertOk(l.invoiceStatus.lookup(invoiceId2) === InvoiceStatus.cancelled, 'status is not cancelled');
    assertOk(l.auditCounter.lookup(sellerKey) === before - 1n, 'the audit counter did not drop');
    record(
      'cancel',
      'cancelInvoice',
      cancelled.public,
      `status pending -> cancelled; seller audit counter ${before} -> ${before - 1n}`,
    );
  }

  writeReceipts();
  logger.info(`wrote docs/receipts/preview.json with ${receipts.length} transactions`);

  await ctx.wallet.stop().catch(() => undefined);
};

await main().catch((error: unknown) => {
  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
