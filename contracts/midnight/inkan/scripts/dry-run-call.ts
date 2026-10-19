// Build a createInvoice call against the deployed contract, without a wallet, and
// stop just before proving.
//
// SPDX-License-Identifier: Apache-2.0
//
// The deploy script needs a synced wallet, and syncing one against a public chain
// takes about twenty-five minutes. A defect that sits between "read the contract's
// state" and "ask the proof server" -- such as two copies of the Midnight runtime
// disagreeing about what a StateValue is -- does not need a wallet to find. This
// builds the call with a prover that throws on purpose, so reaching that throw
// means everything before proving worked, and any other error is a real one.
//
//   INKAN_CONTRACT_ADDRESS=<address> npx tsx scripts/dry-run-call.ts

import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import {
  CurrencyFlag,
  compiledInkanContract,
  emptyPrivateState,
  ledger,
  pureCircuits,
  withActive,
  type InkanPrivateState,
  type InvoiceTerms,
} from '../src/index.js';
import { randomBytes32 } from '../src/util.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ZK_DIR = path.resolve(HERE, '..', 'build-zk');
const INDEXER = 'https://indexer.preview.midnight.network/api/v4/graphql';
const INDEXER_WS = 'wss://indexer.preview.midnight.network/api/v4/graphql/ws';
const STOP = 'DRY_RUN_REACHED_PROVING';

const address = process.env.INKAN_CONTRACT_ADDRESS?.trim();
if (address === undefined || address === '') throw new Error('set INKAN_CONTRACT_ADDRESS');

setNetworkId('preview');

const MICRO = 1_000_000n;
const terms: InvoiceTerms = {
  amount: 15n * MICRO,
  taxAmount: 1_400_000n,
  totalAmount: 16_400_000n,
  dueDate: BigInt(Math.floor(Date.now() / 1000)) + 30n * 86_400n,
  orderId: randomBytes32(),
  currency: new Uint8Array(32).fill(0x4a),
  itemsHash: randomBytes32(),
  memoHash: randomBytes32(),
  lineItemsSum: 15n * MICRO,
  expectedTotal: 16_400_000n,
  taxRateBps: 0n,
  isJct: true,
  taxGroups: {
    groupA: { rateBps: 1000n, netSum: 10n * MICRO, taxSum: 1n * MICRO },
    groupB: { rateBps: 800n, netSum: 5n * MICRO, taxSum: 400_000n },
  },
  jctNumber: 1234567890123n,
  currencyFlag: CurrencyFlag.credits,
  sellerPayout: randomBytes32(),
  buyerPayout: randomBytes32(),
};

const zkConfigProvider = new NodeZkConfigProvider<string>(ZK_DIR);
const stop = async (): Promise<never> => {
  throw new Error(STOP);
};
// A wallet and a prover that do nothing but stop the run. Reaching them proves
// the call was built.
const wallet = {
  getCoinPublicKey: () => '0'.repeat(64),
  getEncryptionPublicKey: () => '0'.repeat(64),
  balanceTx: stop,
  submitTx: stop,
};
const providers = {
  privateStateProvider: levelPrivateStateProvider<'inkanPrivateState', InkanPrivateState>({
    privateStateStoreName: 'inkan-dry-run-private-state',
    signingKeyStoreName: 'inkan-dry-run-signing-keys',
    privateStoragePasswordProvider: () => 'Inkan-dry-run-1',
    accountId: randomBytes(16).toString('hex'),
  }),
  publicDataProvider: indexerPublicDataProvider(INDEXER, INDEXER_WS),
  zkConfigProvider,
  proofProvider: { proveTx: stop },
  walletProvider: wallet,
  midnightProvider: wallet,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

providers.privateStateProvider.setContractAddress(address);
const state = await providers.publicDataProvider.queryContractState(address);
if (state === null) throw new Error('the indexer does not know this contract');
const salt = ledger(state.data).instanceSalt;
console.log('read the contract state; instance salt is', salt.length, 'bytes');

const secret = randomBytes32();
const buyerKey = pureCircuits.derivePartyKeyWith(salt, randomBytes32());

const secretState = emptyPrivateState(secret);
const deployed = await findDeployedContract(providers, {
  compiledContract: compiledInkanContract('../build-zk'),
  contractAddress: address,
  privateStateId: 'inkanPrivateState',
  initialPrivateState: secretState,
});
console.log('joined the contract');

await providers.privateStateProvider.set(
  'inkanPrivateState',
  withActive(secretState, { terms, nonce: randomBytes32() }),
);

try {
  await deployed.callTx.createInvoice(buyerKey, new Uint8Array(32), BigInt(Math.floor(Date.now() / 1000)) - 90n);
  console.log('UNEXPECTED: the call went all the way through');
  process.exitCode = 2;
} catch (error) {
  const text = [error instanceof Error ? error.message : String(error), String((error as { cause?: unknown })?.cause ?? '')].join(' | ');
  if (text.includes(STOP)) {
    console.log('PASS: the call was built and stopped at proving, as intended');
  } else {
    console.log('FAIL:', text.slice(0, 600));
    if (error instanceof Error && error.stack) console.log(error.stack.split('\n').slice(0, 14).join('\n'));
    process.exitCode = 1;
  }
}
process.exit(process.exitCode ?? 0);
