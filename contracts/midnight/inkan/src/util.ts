// Small byte helpers shared by the contract package and its tests.
//
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from 'node:crypto';

export const randomBytes32 = (): Uint8Array => new Uint8Array(randomBytes(32));

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const isZero = (bytes: Uint8Array): boolean => bytes.every((b) => b === 0);
