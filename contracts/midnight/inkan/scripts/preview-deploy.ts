// Deploy Inkan to Midnight Preview, then run its business flow.
//
// SPDX-License-Identifier: Apache-2.0
//
// Tests that run in process prove the rules. They prove nothing to a reader who
// will not clone this repository, so this script does the other half: it deploys
// the real contract to a public network, runs the flow in `flow.ts` against it, and
// writes `docs/receipts/preview.json` -- one entry per transaction with the circuit
// called, the transaction hash, the block, three public explorer links, and the
// state change read back through the public indexer rather than taken from the
// local result of the call.
//
//   INKAN_SEED_FILE=<path outside this repo> npm run preview:deploy
//
// A wallet's first scan of a public chain takes the better part of an hour, and
// every correction to a script used to cost another one. So this process does the
// slow part once and then stays alive: with INKAN_SESSION=1 it waits, and each
// time `scripts/.run-flow` appears it loads a fresh copy of `flow.ts` and runs it.
// Create `scripts/.stop` to end the session.
//
// Other switches:
//   INKAN_CHECK_ONLY=1           sync, print the balances and stop
//   INKAN_CONTRACT_ADDRESS=...   join a contract an earlier run deployed
//   INKAN_DEPLOY_TX=...          that contract's deploy transaction, read from the chain
//
// The seed is read from INKAN_SEED or from the file named by INKAN_SEED_FILE. It
// is never printed and is refused if it sits inside this repository: a funded seed
// on a public network is a key.

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pino from 'pino';
import * as Rx from 'rxjs';

import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { nativeToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { FinalizedTxData } from '@midnight-ntwrk/midnight-js-types';
import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
import { UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';

import { compiledInkanContract, emptyPrivateState, type InkanPrivateState } from '../src/index.js';
import { randomBytes32 } from '../src/util.js';
import type { Session } from './flow.js';
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
 * Where the full compile (proving and verifying keys) lives. The fast compile used
 * by the tests has no keys, so deploying from it would fail to prove.
 */
const ZK_DIR = 'build-zk';

// Preview endpoints, from the networks guide in the Midnight docs
// (docs/guides/networks-and-environments.mdx, "Environment reference"). Preview is
// Midnight-hosted and needs no token.
const PREVIEW: EnvironmentConfiguration = {
  walletNetworkId: 'preview',
  networkId: 'preview',
  indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preview.midnight.network',
  nodeWS: 'wss://rpc.preview.midnight.network',
  faucet: 'https://midnight-tmnight-preview.nethermind.dev/',
  proofServer: process.env.INKAN_PROOF_SERVER ?? 'http://127.0.0.1:6300',
};

const logger = pino({
  level: process.env.INKAN_LOG_LEVEL ?? 'info',
  transport: { target: 'pino-pretty', options: { colorize: false, translateTime: 'HH:MM:ss' } },
});

const assertOk = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`inkan: ${message}`);
};

/**
 * Read a transaction back from the public indexer by hash.
 *
 * Used when joining a contract that an earlier run deployed: that run's own result
 * is gone, and the chain is the better source for its receipt anyway.
 */
export const fetchTransaction = async (txHash: string): Promise<FinalizedTxData> => {
  const response = await fetch(PREVIEW.indexer, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query:
        `{ transactions(offset:{hash:"${txHash}"}) { hash block { height timestamp } ` +
        '... on RegularTransaction { transactionResult { status } } } }',
    }),
  });
  const body = (await response.json()) as {
    data?: {
      transactions?: {
        hash: string;
        transactionResult?: { status: string };
        block: { height: number; timestamp: number };
      }[];
    };
    errors?: { message: string }[];
  };
  const t = body.data?.transactions?.[0];
  if (t === undefined) {
    throw new Error(`inkan: the indexer does not know transaction ${txHash} ${JSON.stringify(body.errors ?? [])}`);
  }
  return {
    txHash: t.hash,
    txId: t.hash,
    blockHeight: t.block.height,
    blockTimestamp: t.block.timestamp,
    status: t.transactionResult?.status ?? 'UNKNOWN',
  } as unknown as FinalizedTxData;
};

const resolveSeed = (): string => {
  const fromEnv = process.env.INKAN_SEED?.trim();
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  const file = process.env.INKAN_SEED_FILE?.trim();
  if (file === undefined || file === '') {
    throw new Error('inkan: set INKAN_SEED_FILE to the funded wallet seed (a file outside this repository).');
  }
  const resolved = path.resolve(file);
  const relative = path.relative(REPO_ROOT, resolved);
  if (relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    throw new Error(`inkan: refusing to read a funded seed from inside the repository (${resolved}).`);
  }
  const seed = fs.readFileSync(resolved, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/i.test(seed)) {
    throw new Error(`inkan: ${file} does not hold a 32-byte hex seed.`);
  }
  return seed;
};

const main = async (): Promise<void> => {
  setNetworkId('preview');
  const startedAt = new Date().toISOString();

  // The cheap checks come first. The scan below takes most of an hour, and a
  // mistake found after it costs another one.
  const existing = process.env.INKAN_CONTRACT_ADDRESS?.trim();
  const existingDeployTx = process.env.INKAN_DEPLOY_TX?.trim();
  let deployReceipt: FinalizedTxData | undefined;
  if (existing !== undefined && existing !== '') {
    assertOk(existingDeployTx !== undefined && existingDeployTx !== '', 'INKAN_DEPLOY_TX is needed to join, so the deploy receipt can be read from the chain');
    deployReceipt = await fetchTransaction(existingDeployTx!);
    assertOk(String(deployReceipt.status) === 'SUCCESS', `the deploy transaction did not succeed (${String(deployReceipt.status)})`);
    logger.info(`deploy transaction ${deployReceipt.txHash} read from the chain: ${String(deployReceipt.status)} in block ${deployReceipt.blockHeight}`);
  }
  if (!fs.existsSync(path.resolve(PACKAGE_ROOT, ZK_DIR, 'keys'))) {
    throw new Error(`inkan: ${ZK_DIR}/keys is missing. Run: compact compile src/inkan.compact ${ZK_DIR}`);
  }
  const seed = resolveSeed();

  const ctx: WalletContext = await buildWallet(PREVIEW, seed);
  const { unshielded } = await addressesOf(ctx);
  const payer = UnshieldedAddress.codec.encode('preview', unshielded).toString();
  logger.info(`network preview, paying from ${payer}`);

  await waitForSync(ctx, logger, 3_600_000);

  const night = nativeToken().raw;
  const state = await Rx.firstValueFrom(ctx.wallet.state());
  const unshieldedNight = state.unshielded?.balances[night] ?? 0n;
  const shieldedNight = state.shielded?.balances[night] ?? 0n;
  logger.info(`NIGHT balance: unshielded ${unshieldedNight}, shielded ${shieldedNight}`);
  if (process.env.INKAN_CHECK_ONLY === '1') {
    await ctx.wallet.stop().catch(() => undefined);
    return;
  }
  assertOk(unshieldedNight + shieldedNight > 0n, `the wallet holds no NIGHT. Fund ${payer} first.`);

  await registerForDust(ctx, logger);

  const walletProvider = new E2EWalletProvider(ctx, logger);
  const zkConfigProvider = new NodeZkConfigProvider<string>(path.resolve(PACKAGE_ROOT, ZK_DIR));
  const compiled = compiledInkanContract(`../${ZK_DIR}`);

  const providers = {
    privateStateProvider: levelPrivateStateProvider<'inkanPrivateState', InkanPrivateState>({
      privateStateStoreName: 'inkan-preview-private-state',
      signingKeyStoreName: 'inkan-preview-signing-keys',
      privateStoragePasswordProvider: () => 'Inkan-preview-deploy-1',
      accountId: randomBytes(16).toString('hex'),
    }),
    publicDataProvider: indexerPublicDataProvider(PREVIEW.indexer, PREVIEW.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(PREVIEW.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deployed: any;
  let address: string;
  if (existing !== undefined && existing !== '') {
    address = existing;
    providers.privateStateProvider.setContractAddress(address);
    deployed = await findDeployedContract(providers, {
      compiledContract: compiled,
      contractAddress: address,
      privateStateId: 'inkanPrivateState',
      initialPrivateState: emptyPrivateState(randomBytes32()),
    });
    logger.info(`joined contract ${address}`);
  } else {
    logger.info('deploying (this builds real proofs and takes a while)');
    deployed = await deployContract(providers, {
      compiledContract: compiled,
      privateStateId: 'inkanPrivateState',
      initialPrivateState: emptyPrivateState(randomBytes32()),
      args: [randomBytes32()],
    });
    address = deployed.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(address);
    deployReceipt = deployed.deployTxData.public as FinalizedTxData;
    logger.info(`contract address ${address}; deploy transaction ${deployReceipt.txHash} in block ${deployReceipt.blockHeight}`);
  }
  assertOk(deployReceipt !== undefined, 'no deploy receipt');

  const session: Session = {
    ctx,
    providers,
    deployed,
    address,
    walletProvider,
    deployReceipt: deployReceipt!,
    night,
    payer,
    indexer: PREVIEW.indexer,
    startedAt,
    repoRoot: REPO_ROOT,
    logger,
  };

  // Load a fresh copy of the flow each time. A module imported twice by the same
  // URL is cached, so each run gets its own file name.
  const runFlowOnce = async (): Promise<void> => {
    const copy = path.join(HERE, `flow.run-${Date.now()}.ts`);
    fs.copyFileSync(path.join(HERE, 'flow.ts'), copy);
    try {
      const mod = (await import(pathToFileURL(copy).href)) as { default: (s: Session) => Promise<void> };
      await mod.default(session);
      logger.info('FLOW_OK');
    } catch (error) {
      logger.error(`FLOW_FAILED ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    } finally {
      fs.rmSync(copy, { force: true });
    }
  };

  if (process.env.INKAN_SESSION !== '1') {
    await runFlowOnce();
  } else {
    const trigger = path.join(HERE, '.run-flow');
    const stop = path.join(HERE, '.stop');
    fs.rmSync(trigger, { force: true });
    fs.rmSync(stop, { force: true });
    logger.info('SESSION_READY: create scripts/.run-flow to run scripts/flow.ts, scripts/.stop to end');
    while (!fs.existsSync(stop)) {
      if (fs.existsSync(trigger)) {
        fs.rmSync(trigger, { force: true });
        await runFlowOnce();
        logger.info('SESSION_READY');
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  await ctx.wallet.stop().catch(() => undefined);
};

await main().catch((error: unknown) => {
  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
