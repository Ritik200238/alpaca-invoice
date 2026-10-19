#!/usr/bin/env node

/**
 * Offline validator for audit packages.
 *
 * Usage:
 *   node tests/validate_audit_package.mjs /path/to/package.json <audit_key_hex>
 *
 * Exits with code 0 on success, 1 on validation failure, 2 on usage error.
 */

import fs from 'fs';
import { webcrypto } from 'crypto';

const subtle = webcrypto.subtle;
const encoder = new TextEncoder();

function usage() {
  console.error('Usage: node tests/validate_audit_package.mjs <package.json> <audit_key_hex>');
  process.exit(2);
}

if (process.argv.length < 4) usage();

const [pkgPath, auditKeyHex] = process.argv.slice(2);

function hexToBytes(hex) {
  if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error('Audit key must be hex');
  return new Uint8Array(hex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
}

async function sha256(buf) {
  const hash = await subtle.digest('SHA-256', buf);
  return Buffer.from(hash).toString('hex');
}

function fromBase64(b64) {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

async function decryptAESGCM(payload, keyBytes) {
  const key = await subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const iv = fromBase64(payload.iv);
  const ciphertext = fromBase64(payload.ciphertext);
  const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(plaintext)));
}

async function main() {
  const raw = fs.readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(raw);

  // Expiry
  if (Date.now() > pkg.expiresAt) {
    throw new Error('Package expired');
  }

  // Cipher hash
  const concat = Buffer.concat([Buffer.from(pkg.cipher.iv, 'base64'), Buffer.from(pkg.cipher.ciphertext, 'base64')]);
  const digest = await sha256(concat);
  if (digest !== pkg.cipherHash) {
    throw new Error('Cipher hash mismatch (tampered payload)');
  }

  // Decrypt
  const decrypted = await decryptAESGCM(pkg.cipher, hexToBytes(auditKeyHex));

  // Recompute invoice hash (matches frontend logic: SHA-256 canonical JSON mod field is omitted; we compare raw SHA-256)
  const canonical = JSON.stringify(decrypted.details || decrypted, Object.keys(decrypted.details || decrypted).sort());
  const hashHex = await sha256(encoder.encode(canonical));
  const hashDec = BigInt('0x' + hashHex).toString() + 'field';
  const cleanChainHash = pkg.invoiceHash.replace(/field\.(private|public)$/, 'field');
  if (hashDec !== cleanChainHash) {
    throw new Error('invoice_hash mismatch after decrypt');
  }

  console.log('✅ VALID');
  console.log('Decrypted payload:\n', JSON.stringify(decrypted, null, 2));
}

main().catch((err) => {
  console.error('❌ INVALID:', err.message);
  process.exit(1);
});
