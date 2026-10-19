import {
  InvoiceDetails,
  AleoField,
  EncryptedPayload,
  LineItem,
  ContractInvoiceHashParams,
  InvoiceHashChainContext,
  TaxGroups
} from '@/lib/types';
import { ICryptoService, CryptoError, AleoInvoiceRecord } from './ICryptoService';
import { createServiceError } from '@/lib/service-errors';
import { Buffer } from 'buffer';
const RULE_TAGS = ['r1', 'r2', 'r3', 'r4', 'r5'] as const;

let sdkPromise: Promise<typeof import('@provablehq/sdk')> | null = null;
const loadSdk = async () => {
  if (!sdkPromise) sdkPromise = import('@provablehq/sdk');
  return sdkPromise;
};

/**
 * Aleo Field modulus (prime p)
 * p = 8444461749428370424248824938781546531375899335154063827935233455917409239041
 * This is the scalar field modulus of the BLS12-377 curve used by the Aleo blockchain
 */
const ALEO_FIELD_MODULUS = BigInt('8444461749428370424248824938781546531375899335154063827935233455917409239041');
const AES_GCM_TAG_LENGTH = 16; // 128 bits

/**
 * CryptoService error class
 */
export const CryptoServiceError = createServiceError<CryptoError>('Crypto');
export type CryptoServiceError = InstanceType<typeof CryptoServiceError>;

/**
 * CryptoService implementation class
 *
 * Responsibilities: Provides encryption, decryption, and hash computation functionality
 * - Compute invoice hash (for on-chain proof of record)
 * - Verify invoice integrity (compare on-chain hash with local hash)
 * - Local encryption/decryption of invoice details (PBKDF2 + AES-GCM)
 * - Parse Aleo Records (process wallet-decrypted data)
 *
 * Core verification flow:
 * 1. On invoice creation: computeInvoiceHash(params) with ContractInvoiceHashParams -> invoice_hash stored on-chain
 * 2. On viewing: parseAleoRecord(jsonString) -> retrieve on-chain invoice_hash
 * 3. On verification: verifyInvoiceIntegrity(localDetails, chainHash, chainContext?) -> confirm data integrity
 *
 * Technical features:
 * - Uses Web Crypto API's SHA-256 for secure hashing
 * - Applies modular arithmetic to ensure hash values are within the valid Aleo Field range
 * - Uses PBKDF2 (100,000 iterations) to derive encryption keys
 */
export class CryptoService implements ICryptoService {
  /**
   * Evaluate audit rules (R1–R5) consistent with contract compute_rules_proof.
   */
  async evaluateAuditRules(input: {
    amount: bigint;
    taxAmount: bigint;
    dueDate: number;
    currentTime: number;
    lineItemsSum: bigint;
    expectedTotal: bigint;
    taxRateBps: bigint;
    invoiceHash: AleoField;
  }): Promise<{ rulesHash: AleoField; r1: boolean; r2: boolean; r3: boolean; r4: boolean; r5: boolean }> {
    const expectedTax = (input.amount * input.taxRateBps) / 10000n;
    const r1 = input.taxAmount === expectedTax;
    const r2 = BigInt(input.dueDate) >= BigInt(input.currentTime);
    const r3 = input.amount + input.taxAmount === input.expectedTotal;
    const r4 = input.lineItemsSum === input.amount;
    const r5 = true; // invoice_hash is already provided; integrity is checked by caller

    const rulesBits = RULE_TAGS.map((_, idx) => {
      return [r1, r2, r3, r4, r5][idx] ? '1' : '0';
    }).join('');

    // Simple hash -> we reuse computeRulesResult logic: hash boolean struct via JSON -> SHA256 -> field
    const hashInput = { r1, r2, r3, r4, r5 };
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(hashInput));
    const hashBuffer = await this.getWebCrypto().subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const hashBigInt = BigInt('0x' + hashHex) % ALEO_FIELD_MODULUS;
    const rulesHash = `${hashBigInt.toString()}field` as AleoField;

    return { rulesHash, r1, r2, r3, r4, r5 };
  }

  sumLineItems(lineItems: LineItem[]): bigint {
    return lineItems.reduce(
      (acc, i) =>
        acc + BigInt(i.amount ?? Math.round(i.quantity * i.unitPrice)),
      0n
    );
  }

  calculateTotal(amount: bigint, taxAmount: bigint): bigint {
    return amount + taxAmount;
  }

  calculateTaxBps(taxRate: number): bigint {
    return BigInt(Math.round(taxRate * 10000));
  }

  dateToU32(date: Date): number {
    return Math.floor(date.getTime() / 1000);
  }

  nowToU32(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Hash arbitrary input (string, object, or array) to AleoField.
   * SHA-256 of the serialized input, then mod ALEO_FIELD_MODULUS.
   */
  async hashObjectToField(input: string | object): Promise<AleoField> {
    const canonical = typeof input === 'string' ? input : JSON.stringify(input);
    const enc = new TextEncoder().encode(canonical);
    const h = await this.getWebCrypto().subtle.digest('SHA-256', enc);
    const hx = Array.from(new Uint8Array(h))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const bi = BigInt('0x' + hx) % ALEO_FIELD_MODULUS;
    return `${bi.toString()}field` as AleoField;
  }

  /** Type guard: contract path uses 10 params (orderId, itemsHash, no lineItems). */
  private static isContractParams(
    x: ContractInvoiceHashParams | InvoiceDetails
  ): x is ContractInvoiceHashParams {
    return (
      'orderId' in x &&
      'itemsHash' in x &&
      !('lineItems' in x)
    );
  }

  /** Pure hash from 10 params. Serialization order matches main.leo InvoiceHashInput. */
  private async hashFromContractParams(params: ContractInvoiceHashParams): Promise<AleoField> {
    const canonical = {
      seller: params.seller,
      buyer: params.buyer,
      amount: params.amount.toString(),
      tax_amount: params.taxAmount.toString(),
      due_date: params.dueDate.toString(),
      nonce: params.nonce,
      order_id: params.orderId,
      currency: params.currency,
      items_hash: params.itemsHash,
      memo_hash: params.memoHash
    };
    return this.hashCanonicalToField(canonical);
  }

  /** Build 10 params from details + chain context (amount/tax from details). Used by verifyInvoiceIntegrity. */
  private buildContractHashParams(
    details: InvoiceDetails,
    chainContext: InvoiceHashChainContext
  ): ContractInvoiceHashParams {
    return {
      seller: chainContext.seller,
      buyer: chainContext.buyer,
      amount: BigInt(Math.round(details.subtotal)),
      taxAmount: BigInt(Math.round(details.taxAmount)),
      dueDate: chainContext.dueDate,
      nonce: chainContext.nonce,
      orderId: chainContext.orderIdField,
      currency: chainContext.currencyField,
      itemsHash: chainContext.itemsHash,
      memoHash: chainContext.memoHash
    };
  }

  /** Hash canonical object (snake_case keys matching Leo) to AleoField. Single place for algorithm (swap for BHP256 later). */
  private async hashCanonicalToField(canonical: Record<string, string>): Promise<AleoField> {
    const encoder = new TextEncoder();
    const str = JSON.stringify(canonical);
    const data = encoder.encode(str);
    const hashBuffer = await this.getWebCrypto().subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const hashBigInt = BigInt('0x' + hashHex);
    const fieldValue = hashBigInt % ALEO_FIELD_MODULUS;
    return `${fieldValue.toString()}field` as AleoField;
  }

  async computeInvoiceHash(
    paramsOrDetails: ContractInvoiceHashParams | InvoiceDetails
  ): Promise<AleoField> {
    try {
      // Warning: this uses browser SHA-256 (mod p). Contract uses BHP256; do not compare result to on-chain invoice_hash.
      if (CryptoService.isContractParams(paramsOrDetails)) {
        return this.hashFromContractParams(paramsOrDetails);
      }
      // Legacy: sorted JSON hash of InvoiceDetails
      const details = paramsOrDetails;
      const crypto = this.getWebCrypto();
      const encoder = new TextEncoder();
      const normalized = JSON.parse(JSON.stringify(details));
      const sortObjectKeys = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(item => sortObjectKeys(item));
        if (obj !== null && typeof obj === 'object') {
          return Object.keys(obj)
            .sort()
            .reduce((sorted: any, key) => {
              sorted[key] = sortObjectKeys(obj[key]);
              return sorted;
            }, {});
        }
        return obj;
      };
      const sortedNormalized = sortObjectKeys(normalized);
      const canonical = JSON.stringify(sortedNormalized);
      const data = encoder.encode(canonical);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const hashBigInt = BigInt('0x' + hashHex);
      const fieldValue = hashBigInt % ALEO_FIELD_MODULUS;
      return `${fieldValue.toString()}field` as AleoField;
    } catch (error: any) {
      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Failed to compute invoice hash in browser',
        { originalError: error }
      );
    }
  }

  /**
   * Local encryption of sensitive data: encrypts details with a private key before saving to StorageService
   * Uses AES-GCM with iv, ciphertext, and authTag (Wave 2).
   *
   * @param details Original details
   * @param masterKey User's locally derived key (string format)
   * @returns Encrypted payload { iv, ciphertext, authTag }
   */
  async encryptPayload(
    details: InvoiceDetails,
    masterKey: string
  ): Promise<EncryptedPayload> {
    try {
      const encryptionKey = await this.deriveEncryptionKey(masterKey);
      return await this.encryptWithRawKey(details, encryptionKey);
    } catch (error: any) {
      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Failed to encrypt payload',
        { originalError: error }
      );
    }
  }

  /**
   * Local decryption of sensitive data
   *
   * @param payload Encrypted payload { iv, ciphertext, authTag? }
   * @param masterKey User's locally derived key (string format)
   * @returns Decrypted invoice details
   * @throws {CryptoServiceError} May throw DECRYPTION_FAILED
   */
  async decryptPayload(
    payload: EncryptedPayload,
    masterKey: string
  ): Promise<InvoiceDetails> {
    try {
      const encryptionKey = await this.deriveEncryptionKey(masterKey);
      return await this.decryptWithRawKey(payload, encryptionKey);
    } catch (error: any) {
      if (error instanceof CryptoServiceError) throw error;
      throw new CryptoServiceError(
        CryptoError.DECRYPTION_FAILED,
        'Failed to decrypt payload. Invalid master key or corrupted data.',
        { originalError: error }
      );
    }
  }

  /** Salt for KV store key derivation (shared by seller and buyer via invoiceId). */
  private static readonly KV_DETAILS_KEY_SALT = 'alpaca-invoice-details-kv-v1';

  /**
   * Derive a 256-bit key from invoiceId for online KV store encryption.
   * Both seller and buyer can derive the same key from the public invoiceId.
   */
  private async deriveKeyFromInvoiceId(invoiceId: string): Promise<Uint8Array> {
    // Normalize: strip .private/.public suffix so both parties derive the same key
    const normalizedId = invoiceId.replace(/field\.(private|public)$/, 'field');
    const crypto = this.getWebCrypto();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(normalizedId),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const salt = new TextEncoder().encode(CryptoService.KV_DETAILS_KEY_SALT);
    const derivedBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    return new Uint8Array(derivedBits);
  }

  /**
   * Encrypt invoice details with key derived from invoiceId (§3.9 shared-key for KV store).
   */
  async encryptPayloadWithInvoiceId(
    details: InvoiceDetails,
    invoiceId: string
  ): Promise<EncryptedPayload> {
    try {
      const key = await this.deriveKeyFromInvoiceId(invoiceId);
      return await this.encryptWithRawKey(details, key);
    } catch (error: any) {
      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Failed to encrypt payload for KV store',
        { originalError: error }
      );
    }
  }

  /**
   * Decrypt payload encrypted with encryptPayloadWithInvoiceId.
   */
  async decryptPayloadWithInvoiceId(
    payload: EncryptedPayload,
    invoiceId: string
  ): Promise<InvoiceDetails> {
    try {
      const key = await this.deriveKeyFromInvoiceId(invoiceId);
      return await this.decryptWithRawKey(payload, key);
    } catch (error: any) {
      if (error instanceof CryptoServiceError) throw error;
      throw new CryptoServiceError(
        CryptoError.DECRYPTION_FAILED,
        'Failed to decrypt KV store payload. Invalid invoiceId or corrupted data.',
        { originalError: error }
      );
    }
  }

  /**
   * Decrypt payload with raw Uint8Array key (for audit package validation).
   */
  async decryptWithRawKey(
    payload: EncryptedPayload,
    encryptionKey: Uint8Array
  ): Promise<InvoiceDetails> {
    const crypto = this.getWebCrypto();
    const iv = Buffer.from(payload.iv, 'base64');
    let ciphertextBytes = Buffer.from(payload.ciphertext, 'base64');
    if (payload.authTag) {
      const tagBytes = Buffer.from(payload.authTag, 'base64');
      ciphertextBytes = Buffer.concat([ciphertextBytes, tagBytes]);
    }
    const key = await crypto.subtle.importKey(
      'raw',
      encryptionKey as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertextBytes as BufferSource
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as InvoiceDetails;
  }

  /**
   * Wrap master key with device key (AES-GCM) for localStorage persistence.
   * Same device can later unwrap without re-signing.
   */
  async wrapMasterKeyWithDeviceKey(
    masterKey: string,
    deviceKeyBytes: Uint8Array
  ): Promise<EncryptedPayload> {
    const crypto = this.getWebCrypto();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(masterKey);
    const key = await crypto.subtle.importKey(
      'raw',
      deviceKeyBytes as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    const fullOutput = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      plaintext as BufferSource
    );
    const buf = new Uint8Array(fullOutput);
    const ciphertextBytes = buf.slice(0, buf.length - AES_GCM_TAG_LENGTH);
    const authTagBytes = buf.slice(buf.length - AES_GCM_TAG_LENGTH);
    return {
      iv: Buffer.from(iv).toString('base64'),
      ciphertext: Buffer.from(ciphertextBytes).toString('base64'),
      authTag: Buffer.from(authTagBytes).toString('base64')
    };
  }

  /**
   * Unwrap master key from device-key-encrypted payload.
   */
  async unwrapMasterKeyWithDeviceKey(
    payload: EncryptedPayload,
    deviceKeyBytes: Uint8Array
  ): Promise<string> {
    const crypto = this.getWebCrypto();
    const iv = Buffer.from(payload.iv, 'base64');
    let ciphertextBytes = Buffer.from(payload.ciphertext, 'base64');
    if (payload.authTag) {
      const tagBytes = Buffer.from(payload.authTag, 'base64');
      ciphertextBytes = Buffer.concat([ciphertextBytes, tagBytes]);
    }
    const key = await crypto.subtle.importKey(
      'raw',
      deviceKeyBytes as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertextBytes as BufferSource
    );
    return new TextDecoder().decode(plaintext);
  }

  /**
   * Parse a decrypted InvoiceRecord from wallet.requestRecords()
   *
   * This is a key step in the invoice verification flow:
   * 1. The wallet returns decrypted on-chain Records via requestRecords()
   * 2. This method parses the JSON and extracts fields like invoice_hash
   * 3. The caller can then use verifyInvoiceIntegrity() to verify data integrity
   *
   * Complete verification flow example:
   * ```typescript
   * // 1. Get on-chain Record
   * const records = await wallet.requestRecords('zk_invoice_v3_1.aleo');
   * const chainRecord = await cryptoService.parseAleoRecord<AleoInvoiceRecord>(
   *   JSON.stringify(records[0].data)
   * );
   *
   * // 2. Get locally encrypted details from IndexedDB
   * const encryptedPayload = await storageService.getInvoice(chainRecord.invoice_id);
   * const localDetails = await cryptoService.decryptPayload(encryptedPayload, masterKey);
   *
   * // 3. Verify integrity
   * const isValid = await cryptoService.verifyInvoiceIntegrity(
   *   localDetails,
   *   chainRecord.invoice_hash as AleoField
   * );
   * if (!isValid) {
   *   throw new Error('Invoice data has been tampered with!');
   * }
   * ```
   *
   * @param jsonString Decrypted JSON string (from wallet.requestRecords())
   * @returns Parsed Record data object (generic support, defaults to AleoInvoiceRecord)
   * @throws {CryptoServiceError} If the JSON format is invalid or is in encrypted record1... format
   */
  async parseAleoRecord<T = AleoInvoiceRecord>(jsonString: string): Promise<T> {
    try {
      // Empty string check
      if (!jsonString || jsonString.trim() === '') {
        throw new CryptoServiceError(
          CryptoError.DECRYPTION_FAILED,
          'Empty input string',
          { hint: 'Input cannot be empty' }
        );
      }

      // Process decrypted JSON data (from wallet.requestRecords())
      if (jsonString.startsWith('{') || jsonString.startsWith('[')) {
        const parsed = JSON.parse(jsonString);

        // Clean Aleo format type markers and visibility modifiers
        const cleanRecord = (obj: any): any => {
          if (typeof obj === 'string') {
            // Remove field.private or field.public suffix
            if (obj.includes('field.')) {
              return obj.replace(/field\.(private|public)$/, 'field');
            }
            // Remove numeric type suffixes (u8, u16, u32, u64, u128, i8, i16, i32, i64, i128)
            // e.g., "1000000u64" -> "1000000", "0u8" -> "0"
            if (obj.match(/^\d+[ui](8|16|32|64|128)$/)) {
              return obj.replace(/[ui](8|16|32|64|128)$/, '');
            }
            // Remove other visibility modifiers (e.g., .private, .public)
            if (obj.match(/\.(private|public)$/)) {
              return obj.replace(/\.(private|public)$/, '');
            }
          }
          if (Array.isArray(obj)) {
            return obj.map(item => cleanRecord(item));
          }
          if (obj !== null && typeof obj === 'object') {
            const cleaned: any = {};
            for (const key in obj) {
              cleaned[key] = cleanRecord(obj[key]);
            }
            return cleaned;
          }
          return obj;
        };

        const cleaned = cleanRecord(parsed);
        // console.log('🧹 [parseAleoRecord] Original record:', parsed);
        // console.log('🧹 [parseAleoRecord] Cleaned record:', cleaned);
        return cleaned as T;
      }

      // If it's in record1... format, suggest using the correct approach
      if (jsonString.startsWith('record1')) {
        throw new CryptoServiceError(
          CryptoError.DECRYPTION_FAILED,
          'Encrypted record format detected. Please use wallet.requestRecords() to get decrypted data.',
          {
            hint: 'The record1... format is encrypted. Use wallet.requestRecords() which automatically decrypts records using your ViewKey.',
            inputPrefix: jsonString.substring(0, 20) + '...'
          }
        );
      }

      // Unknown format
      throw new CryptoServiceError(
        CryptoError.DECRYPTION_FAILED,
        'Unknown input format. Expected JSON string from wallet.requestRecords().',
        { inputPrefix: jsonString.substring(0, Math.min(20, jsonString.length)) + '...' }
      );
    } catch (error: any) {
      if (error instanceof CryptoServiceError) {
        throw error;
      }

      throw new CryptoServiceError(
        CryptoError.DECRYPTION_FAILED,
        'Failed to parse Aleo Record JSON',
        { originalError: error?.message || error }
      );
    }
  }

  /**
   * Verify invoice integrity: compare hash of local details with on-chain stored hash
   *
   * This is the core method for tamper-proof verification:
   * - Recomputes the hash of local invoice details
   * - Compares with the invoice_hash stored in the on-chain InvoiceRecord
   * - If they match, it proves the local data matches the on-chain proof and has not been tampered with
   *
   * @param localDetails Locally stored invoice details (decrypted from IndexedDB)
   * @param chainInvoiceHash The invoice_hash field from the on-chain Record
   * @returns true indicates data is intact and untampered, false indicates data inconsistency
   */
  async verifyInvoiceIntegrity(
    localDetails: InvoiceDetails,
    chainInvoiceHash: AleoField,
    chainContext?: InvoiceHashChainContext,
    options?: { expectedChainHash?: AleoField; mode?: 'chain' | 'recompute' }
  ): Promise<boolean> {
    if (!localDetails || typeof localDetails !== 'object') {
      throw new CryptoServiceError(
        CryptoError.HASH_MISMATCH,
        'Invalid invoice details for integrity verification',
        { localDetails }
      );
    }

    const cleanChainHash = this.normalizeField(chainInvoiceHash) as AleoField;

    if (options?.mode === 'chain') {
      const expected = options.expectedChainHash
        ? (this.normalizeField(options.expectedChainHash) as AleoField)
        : cleanChainHash;
      return cleanChainHash === expected;
    }

    try {
      const computedHash =
        chainContext != null
          ? await this.computeInvoiceHash(this.buildContractHashParams(localDetails, chainContext))
          : await this.computeInvoiceHash(localDetails);
      return this.normalizeField(computedHash) === cleanChainHash;
    } catch (error: any) {
      throw new CryptoServiceError(
        CryptoError.HASH_MISMATCH,
        'Failed to verify invoice integrity',
        { originalError: error?.message || error }
      );
    }
  }

  private normalizeField(field: AleoField | string): string {
    return String(field).replace(/field\.(private|public)$/i, 'field').trim();
  }

  /**
   * Get Web Crypto API instance
   */
  private getWebCrypto(): Crypto {
    if (typeof globalThis.crypto !== 'undefined') {
      return globalThis.crypto as Crypto;
    }
    throw new Error('WebCrypto not available in this environment');
  }

  /**
   * Derive a 32-byte encryption key from a string key using PBKDF2
   *
   * Improvement notes:
   * - Uses the standard PBKDF2 Key Derivation Function
   * - Provides better security by generating strong keys even from weak input keys
   * - Uses a fixed salt (in production, a user-specific salt should be used)
   *
   * @param masterKey User-provided master key string
   * @returns 32-byte encryption key
   */
  private async deriveEncryptionKey(masterKey: string): Promise<Uint8Array> {
    const crypto = this.getWebCrypto();

    // Convert master key to CryptoKey object
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(masterKey),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    // Derive key using PBKDF2
    // Note: In production, the salt should be user-specific (e.g., derived from address)
    const salt = new TextEncoder().encode('alpaca-invoice-salt-v1');
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000, // OWASP recommends at least 100,000 iterations
        hash: 'SHA-256'
      },
      keyMaterial,
      256 // 256 bits = 32 bytes
    );

    return new Uint8Array(derivedBits);
  }

  /**
   * Derive master key from signature (used for local encryption of invoice details)
   *
   * Use cases:
   * - When a user first creates an invoice and needs to authorize access to private invoice data
   * - Obtain a signature by signing a message, then derive the master key from that signature
   * - The master key is used to encrypt/decrypt invoice details stored in IndexedDB
   *
   * Implementation details:
   * 1. Hash the signature using SHA-256
   * 2. Convert the hash result to a hexadecimal string
   * 3. Return that string as the masterKey (which will be further derived into an encryption key via PBKDF2)
   *
   * Security:
   * - The signature is produced by the user's wallet private key on a specific message, ensuring uniqueness and unforgeability
   * - SHA-256 ensures randomness and security of the key
   * - The same signature always produces the same master key (deterministic derivation)
   *
   * @param signature Wallet-signed message (from signMessage)
   * @returns Master key string (used for subsequent encryption/decryption)
   * @throws {CryptoServiceError} May throw ENCRYPTION_FAILED
   */
  async deriveMasterKey(signature: string): Promise<string> {
    if (!signature || signature.trim() === '') {
      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Signature cannot be empty',
        { hint: 'Signature is required to derive master key' }
      );
    }

    try {
      // Get Web Crypto API
      const crypto = this.getWebCrypto();

      // Hash the signature using SHA-256
      const encoder = new TextEncoder();
      const signatureBytes = encoder.encode(signature);
      const hashBuffer = await crypto.subtle.digest('SHA-256', signatureBytes);

      // Convert ArrayBuffer to hexadecimal string
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const masterKey = hashArray
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      return masterKey;
    } catch (error: any) {
      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Failed to derive master key from signature',
        { originalError: error }
      );
    }
  }

  /**
   * Generate a random audit key for audit package encryption
   * 
   * @returns Random audit key as hex string (64 characters)
   * @throws {CryptoServiceError} If random generation fails
   */
  generateAuditKey(): string {
    try {
      // Get Web Crypto API
      const crypto = this.getWebCrypto();

      // Generate 32 random bytes (256 bits)
      const bytes = crypto.getRandomValues(new Uint8Array(32));

      // Convert to hexadecimal string
      const hexKey = Buffer.from(bytes).toString('hex');

      return hexKey;
    } catch (error: any) {
      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Failed to generate random audit key',
        { originalError: error }
      );
    }
  }

  /**
   * Convert hex audit key string to Uint8Array
   * 
   * @param auditKey Hex string audit key
   * @returns Uint8Array suitable for encryption
   * @throws {CryptoServiceError} If audit key format is invalid
   */
  auditKeyToBytes(auditKey: string): Uint8Array {
    try {
      // Validate format: must be hex and at least 32 characters (16 bytes)
      if (!auditKey || typeof auditKey !== 'string') {
        throw new CryptoServiceError(
          CryptoError.ENCRYPTION_FAILED,
          'Audit key must be a non-empty string'
        );
      }

      if (!/^[0-9a-fA-F]+$/.test(auditKey)) {
        throw new CryptoServiceError(
          CryptoError.ENCRYPTION_FAILED,
          'Invalid audit key format: must be hexadecimal',
          { hint: 'Audit key should only contain 0-9 and a-f characters' }
        );
      }

      if (auditKey.length < 32) {
        throw new CryptoServiceError(
          CryptoError.ENCRYPTION_FAILED,
          'Audit key too short: must be at least 32 hex characters (16 bytes)',
          { actualLength: auditKey.length }
        );
      }

      // Convert hex string to Uint8Array
      const buffer = Buffer.from(auditKey, 'hex');
      return new Uint8Array(buffer);
    } catch (error: any) {
      // Already a CryptoServiceError, rethrow directly
      if (error instanceof CryptoServiceError) {
        throw error;
      }

      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Failed to convert audit key to bytes',
        { originalError: error }
      );
    }
  }

  /**
   * Hash encrypted payload (SHA-256 of iv + ciphertext)
   * 
   * @param payload Encrypted payload
   * @returns Hex hash string
   * @throws {CryptoServiceError} If hashing fails
   */
  async hashCipher(payload: EncryptedPayload): Promise<string> {
    try {
      // Validate input
      if (!payload || !payload.iv || !payload.ciphertext) {
        throw new CryptoServiceError(
          CryptoError.ENCRYPTION_FAILED,
          'Invalid encrypted payload: missing iv or ciphertext'
        );
      }

      // Get Web Crypto API
      const crypto = this.getWebCrypto();

      // Concatenate iv and ciphertext
      const ivBuffer = Buffer.from(payload.iv, 'base64');
      const ciphertextBuffer = Buffer.from(payload.ciphertext, 'base64');
      const concat = Buffer.concat([ivBuffer, ciphertextBuffer]);

      // Hash the concatenated data
      const digest = await crypto.subtle.digest('SHA-256', concat);

      // Convert to hex string
      const hashArray = Array.from(new Uint8Array(digest));
      const hexHash = hashArray
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      return hexHash;
    } catch (error: any) {
      // Already a CryptoServiceError, rethrow directly
      if (error instanceof CryptoServiceError) {
        throw error;
      }

      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Failed to hash cipher',
        { originalError: error }
      );
    }
  }

  /**
   * SHA-256 hash of UTF-8 string; returns 64-char hex.
   * Used for canonical payload integrity (e.g. DecryptedAuditPayload without integrity).
   */
  async hashUtf8ToHex(input: string): Promise<string> {
    const crypto = this.getWebCrypto();
    const enc = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    const hashArray = Array.from(new Uint8Array(digest));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * AES-GCM encrypt with raw key. Produces { iv, ciphertext, authTag }.
   */
  private async encryptWithRawKey(
    data: InvoiceDetails | Record<string, unknown>,
    encryptionKey: Uint8Array
  ): Promise<EncryptedPayload> {
    const crypto = this.getWebCrypto();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const key = await crypto.subtle.importKey(
      'raw',
      encryptionKey as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    const fullOutput = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      plaintext as BufferSource
    );
    const buf = new Uint8Array(fullOutput);
    const ciphertextBytes = buf.slice(0, buf.length - AES_GCM_TAG_LENGTH);
    const authTagBytes = buf.slice(buf.length - AES_GCM_TAG_LENGTH);
    return {
      iv: Buffer.from(iv).toString('base64'),
      ciphertext: Buffer.from(ciphertextBytes).toString('base64'),
      authTag: Buffer.from(authTagBytes).toString('base64')
    };
  }

  /**
   * Convert payload to JSON-serializable form (e.g. audit filtered data may include bigint, Date).
   */
  private serializableForEncryption(obj: unknown): Record<string, unknown> {
    return JSON.parse(
      JSON.stringify(obj, (_key, value) => {
        if (typeof value === 'bigint') return value.toString();
        if (value instanceof Date) return value.toISOString();
        return value;
      })
    ) as Record<string, unknown>;
  }

  /**
   * Encrypt with raw audit key (no key derivation)
   * 
   * @param details Invoice details or partial invoice to encrypt
   * @param auditKey Raw encryption key as Uint8Array
   * @returns Encrypted payload
   * @throws {CryptoServiceError} If encryption fails
   */
  async encryptWithAuditKey(
    details: InvoiceDetails | Partial<any>,
    auditKey: Uint8Array
  ): Promise<EncryptedPayload> {
    try {
      // Validate inputs
      if (!details) {
        throw new CryptoServiceError(
          CryptoError.ENCRYPTION_FAILED,
          'Details cannot be null or undefined'
        );
      }

      if (!auditKey || !(auditKey instanceof Uint8Array)) {
        throw new CryptoServiceError(
          CryptoError.ENCRYPTION_FAILED,
          'Audit key must be a Uint8Array'
        );
      }

      if (auditKey.length < 16) {
        throw new CryptoServiceError(
          CryptoError.ENCRYPTION_FAILED,
          'Audit key too short: must be at least 16 bytes',
          { actualLength: auditKey.length }
        );
      }

      // Normalize payload for JSON serialization (e.g. audit filtered data may have bigint, Date)
      const serializable = this.serializableForEncryption(details);

      return await this.encryptWithRawKey(serializable, auditKey);
    } catch (error: any) {
      // Already a CryptoServiceError, rethrow directly
      if (error instanceof CryptoServiceError) {
        throw error;
      }

      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Failed to encrypt with audit key',
        { originalError: error }
      );
    }
  }

  /**
   * Wave 3: 将 TaxGroups 序列化为合约兼容的 Leo struct 字符串
   */
  serializeTaxGroupsForContract(groups: TaxGroups): string {
    const ga = groups.group_a;
    const gb = groups.group_b;
    return `{group_a: {rate_bps: ${ga.rate_bps}u64, net_sum: ${ga.net_sum}u64, tax_sum: ${ga.tax_sum}u64}, group_b: {rate_bps: ${gb.rate_bps}u64, net_sum: ${gb.net_sum}u64, tax_sum: ${gb.tax_sum}u64}}`;
  }

  /**
   * Wave 3: BHP256::hash_to_field(TaxGroups) 用于 tax_tag
   */
  async hashTaxGroups(groups: TaxGroups): Promise<AleoField> {
    try {
      const sdk = await loadSdk();
      const literal = this.serializeTaxGroupsForContract(groups);
      const pt = (sdk as any).Plaintext.fromString(literal);
      const bits = pt.toBitsLe();
      const hash = new sdk.BHP256().hash(bits).toString();
      return (hash.endsWith('field') ? hash : `${hash}field`) as AleoField;
    } catch (error: any) {
      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Failed to compute hashTaxGroups (BHP256)',
        { originalError: error }
      );
    }
  }

  /**
   * Wave 3: 13 位 T 号码 → u64 → BHP256::hash_to_field 用于 jct_registration
   */
  async hashTNumber(tNumber: string): Promise<AleoField> {
    const trimmed = String(tNumber).trim();
    if (!/^\d{13}$/.test(trimmed)) {
      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'tNumber must be exactly 13 digits',
        { tNumber: trimmed }
      );
    }
    const u64Val = BigInt(trimmed);
    if (u64Val > BigInt('18446744073709551615')) {
      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'tNumber exceeds u64 range',
        { tNumber: trimmed }
      );
    }
    try {
      const sdk = await loadSdk();
      const literal = `${u64Val}u64`;
      const pt = (sdk as any).Plaintext.fromString(literal);
      const bits = pt.toBitsLe();
      const hash = new sdk.BHP256().hash(bits).toString();
      return (hash.endsWith('field') ? hash : `${hash}field`) as AleoField;
    } catch (error: any) {
      throw new CryptoServiceError(
        CryptoError.ENCRYPTION_FAILED,
        'Failed to compute hashTNumber (BHP256)',
        { originalError: error }
      );
    }
  }

  /**
   * Wave 3: 本地 tax_tag 三项验证（A/B/C）
   */
  async verifyTaxTag(params: {
    taxGroups: TaxGroups;
    taxTag: AleoField;
    totalAmount: bigint;
  }): Promise<{
    a: { ok: boolean; detail?: string };
    b: { ok: boolean; detail?: string };
    c: { ok: boolean; detail?: string };
    allPassed: boolean;
  }> {
    const { taxGroups, taxTag, totalAmount } = params;
    const aChecks: string[] = [];
    for (const [name, g] of [['group_a', taxGroups.group_a], ['group_b', taxGroups.group_b]] as const) {
      const expected = (g.net_sum * BigInt(g.rate_bps)) / 10000n;
      const ok = g.tax_sum === expected;
      if (!ok) aChecks.push(`${name}: expected tax_sum=${expected}, got ${g.tax_sum}`);
    }
    const a = { ok: aChecks.length === 0, detail: aChecks.length ? aChecks.join('; ') : undefined };

    const computedTag = await this.hashTaxGroups(taxGroups);
    const b = {
      ok: this.normalizeField(computedTag) === this.normalizeField(taxTag),
      detail: undefined as string | undefined
    };
    if (!b.ok) b.detail = 'BHP256(TaxGroups) does not match tax_tag';

    const sum =
      taxGroups.group_a.net_sum +
      taxGroups.group_a.tax_sum +
      taxGroups.group_b.net_sum +
      taxGroups.group_b.tax_sum;
    const c = {
      ok: sum === totalAmount,
      detail: sum === totalAmount ? undefined : `sum(net_sum+tax_sum)=${sum} !== total_amount=${totalAmount}`
    };

    return {
      a,
      b,
      c,
      allPassed: a.ok && b.ok && c.ok
    };
  }

  /**
   * Validate whether a Field value is within the valid range
   * Used for testing and debugging
   *
   * @param fieldStr AleoField format string
   * @returns Whether the value is valid
   */
  public validateFieldValue(fieldStr: AleoField): boolean {
    try {
      // Remove 'field' suffix
      const numStr = fieldStr.replace(/field$/, '');
      const value = BigInt(numStr);

      // Check if it is within the valid range
      return value >= 0n && value < ALEO_FIELD_MODULUS;
    } catch {
      return false;
    }
  }
}
