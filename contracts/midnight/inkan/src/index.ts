// Public surface of the Inkan contract package.
//
// SPDX-License-Identifier: Apache-2.0

import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

import * as Compiled from '../build/contract/index.js';
import * as Wit from './witnesses.js';

/**
 * The contract, bound to its witnesses and to the location of its proving and
 * verifying keys, in the form midnight-js deploys and calls.
 *
 * `assetDir` is where `compact compile` wrote `keys/` and `zkir/`, relative to
 * this module. It is a parameter because the fast compile used for the tests
 * (`build/`, no keys) and the full compile used on a network (`build-zk/`) are
 * different directories, and deploying with the wrong one produces a proof
 * failure far from the cause.
 */
export const compiledInkanContract = (assetDir: string) =>
  CompiledContract.make<Compiled.Contract<Wit.InkanPrivateState>>(
    'Inkan',
    Compiled.Contract<Wit.InkanPrivateState>,
  ).pipe(
    CompiledContract.withWitnesses(Wit.witnesses),
    CompiledContract.withCompiledFileAssets(assetDir),
  );

export * from '../build/contract/index.js';
export * from './witnesses.js';
export * from './util.js';
