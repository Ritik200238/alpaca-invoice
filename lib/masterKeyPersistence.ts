import { Buffer } from 'buffer';
import type { EncryptedPayload } from './types';

const DEVICE_KEY_STORAGE = 'aleo-wallet-storage-deviceKey';
const ENCRYPTED_MASTER_KEYS_STORAGE = 'aleo-wallet-storage-encryptedMasterKey';

/** Normalize publicKey for storage key so reconnect with slightly different format still hits same entry. */
function normalizePublicKey(publicKey: string): string {
  return publicKey.trim().toLowerCase();
}

function getCrypto(): Crypto {
  if (typeof window === 'undefined' || !window.crypto) {
    throw new Error('Crypto not available');
  }
  return window.crypto;
}

/**
 * Get or create a 32-byte device key (stored in localStorage, same device).
 * Used only to wrap/unwrap masterKey so re-auth on same device does not require a new signature.
 */
export function getOrCreateDeviceKey(): Uint8Array {
  const raw = localStorage.getItem(DEVICE_KEY_STORAGE);
  if (raw) {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) return new Uint8Array(decoded);
  }
  const key = getCrypto().getRandomValues(new Uint8Array(32));
  localStorage.setItem(DEVICE_KEY_STORAGE, Buffer.from(key).toString('base64'));
  return key;
}

/**
 * Get encrypted master key payload for the given publicKey (if any).
 * publicKey is normalized so wallet reconnect with different casing/whitespace still hits same entry.
 */
export function getEncryptedMasterKey(publicKey: string): EncryptedPayload | null {
  const raw = localStorage.getItem(ENCRYPTED_MASTER_KEYS_STORAGE);
  if (!raw) return null;
  try {
    const map: Record<string, EncryptedPayload> = JSON.parse(raw);
    return map[normalizePublicKey(publicKey)] ?? null;
  } catch {
    return null;
  }
}

/**
 * Store encrypted master key for the given publicKey.
 * publicKey is normalized for consistent lookup on restore.
 */
export function setEncryptedMasterKey(publicKey: string, payload: EncryptedPayload): void {
  const raw = localStorage.getItem(ENCRYPTED_MASTER_KEYS_STORAGE);
  const map: Record<string, EncryptedPayload> = raw ? JSON.parse(raw) : {};
  map[normalizePublicKey(publicKey)] = payload;
  localStorage.setItem(ENCRYPTED_MASTER_KEYS_STORAGE, JSON.stringify(map));
}

/**
 * Clear encrypted master key for the given publicKey (e.g. explicit logout / forget this device).
 * Device key is kept so other accounts on same device can still use their stored key.
 * Normalized publicKey is used so the same key used at set/get is cleared.
 */
export function clearEncryptedMasterKey(publicKey: string): void {
  const raw = localStorage.getItem(ENCRYPTED_MASTER_KEYS_STORAGE);
  if (!raw) return;
  try {
    const map: Record<string, EncryptedPayload> = JSON.parse(raw);
    delete map[normalizePublicKey(publicKey)];
    localStorage.setItem(ENCRYPTED_MASTER_KEYS_STORAGE, JSON.stringify(map));
  } catch {
    // ignore
  }
}
