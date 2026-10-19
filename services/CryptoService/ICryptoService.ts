// services/CryptoService.ts
import {
  InvoiceDetails,
  AleoField,
  AleoTransactionId,
  EncryptedPayload,
  LineItem,
  ContractInvoiceHashParams,
  InvoiceHashChainContext,
  TaxGroups
} from '@/lib/types';

/** * Crypto error enum */
export enum CryptoError {
  HASH_MISMATCH = 'HASH_MISMATCH',       // Computed hash does not match the on-chain attestation
  DECRYPTION_FAILED = 'DECRYPTION_FAILED', // Decryption failed (usually an incorrect ViewKey)
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED'  // Encryption failed
}

/**
 * Structure of on-chain InvoiceRecord (Wave 2, data decrypted by wallet.requestRecords())
 * Matches main.leo InvoiceRecord
 */
export interface AleoInvoiceRecord {
  owner: string;           // Record owner address
  invoice_id: string;      // Unique invoice ID (Field format)
  invoice_hash: string;    // Invoice details hash (Field format, used for integrity verification)
  amount: string;          // Invoice amount (microcredits)
  tax_amount: string;      // Tax amount (microcredits)
  seller: string;          // Seller address
  buyer: string;           // Buyer address
  due_date: number;        // Due date (Unix timestamp)
  created_at: number;      // Creation time (Unix timestamp)
  status: number;          // Status (0=pending, 1=paid, 2=cancelled, 3=expired)
  order_id: string;        // Order linkage (0field if unused)
  currency: string;        // Currency code hashed to field
  items_hash: string;      // Hash/commitment of line items
  memo_hash: string;       // Optional memo hash (0field if unused)
  _nonce?: string;         // Record nonce (optional)
  // Wave 3 optional (v3 InvoiceRecord)
  tax_tag?: string;        // field; BHP256(TaxGroups); 0field = non-JCT
  jct_registration?: string; // field; BHP256(T_number as u64)
  total_amount?: string;   // u64
  currency_flag?: number;  // u8: 0=Credits, 1=USDCx
  /** Chain transaction id from wallet record metadata */
  transactionId?: AleoTransactionId;
  /** Chain block height from wallet record metadata */
  blockHeight?: number;
}

/**
 * Structure of on-chain PaymentRecord (receipt record generated after payment)
 */
export interface AleoPaymentRecord {
  owner: string;           // Record owner address
  payment_id: string;      // Unique payment ID (Field format)
  invoice_id: string;      // Associated invoice ID (Field format)
  payer: string;           // Payer address
  payee: string;           // Payee address
  amount: string;          // Payment amount (microcredits)
  paid_at: number;         // Payment time (Unix timestamp)
  _nonce?: string;         // Record nonce (optional)
  /** Wave 3: 结算锚点 = 承诺哈希（settlement_anchor），供审计 Step 2 回溯 payment_commitments mapping */
  settlement_anchor?: string;  // field
  /** Chain transaction id from wallet record metadata */
  transactionId?: AleoTransactionId;
  /** Chain block height from wallet record metadata */
  blockHeight?: number;
}

/**
 * Union type for on-chain Records (InvoiceRecord or PaymentRecord)
 */
export type AleoRecord = AleoInvoiceRecord | AleoPaymentRecord;

export interface ICryptoService {
  /**
   * Hash arbitrary input (string, object, or array) to AleoField.
   * Uses SHA-256 then mod ALEO_FIELD_MODULUS.
   *
   * create_invoice usage (see CryptoService.test.ts for examples):
   *   order_id   <- hashObjectToField(details.orderId ?? details.invoiceNumber)
   *   currency   <- hashObjectToField(details.currency)
   *   items_hash <- hashObjectToField(details.lineItems)
   *   memo_hash  <- hashObjectToField(details.notes ?? '')
   *   nonce      <- hashObjectToField(`NONCE-${Date.now()}-${randomBytes}`)
   *
   * @param input String, object, or array to hash
   * @returns AleoField (format: "123...field")
   */
  hashObjectToField(input: string | object): Promise<AleoField>;

  /**
   * Sum of line item amounts. Must equal amount for contract R4.
   */
  sumLineItems(lineItems: LineItem[]): bigint;

  /**
   * amount + taxAmount. Must match for contract R3.
   */
  calculateTotal(amount: bigint, taxAmount: bigint): bigint;

  /**
   * Tax rate in basis points (e.g. 13% -> 1300).
   */
  calculateTaxBps(taxRate: number): bigint;

  /**
   * Date to Unix timestamp (u32).
   */
  dateToU32(date: Date): number;

  /**
   * Current time as Unix timestamp (u32).
   */
  nowToU32(): number;

  /**
   * Invoice hash: contract-aligned (10 params) or legacy (sorted JSON of details).
   *
   * Contract path: pass ContractInvoiceHashParams (same 10 fields as main.leo compute_invoice_hash_internal). No details.
   * Legacy path: pass InvoiceDetails only; uses sorted JSON hash (e.g. for payment nonce).
   * Warning: implementation currently uses SHA-256 (mod field) and is NOT equal to contract BHP256 hash.
   */
  computeInvoiceHash(params: ContractInvoiceHashParams): Promise<AleoField>;
  computeInvoiceHash(details: InvoiceDetails): Promise<AleoField>;

  /**
   * Parse a decrypted InvoiceRecord from wallet.requestRecords()
   *
   * Complete invoice verification flow:
   * ```typescript
   * // 1. Get decrypted on-chain Records from the wallet
   * const records = await wallet.requestRecords('zk_invoice_v3_1.aleo');
   * const chainRecord = await cryptoService.parseAleoRecord<AleoInvoiceRecord>(
   *   JSON.stringify(records[0].data)
   * );
   *
   * // 2. Retrieve locally encrypted details from IndexedDB
   * const encryptedPayload = await storageService.getInvoice(chainRecord.invoice_id);
   * const localDetails = await cryptoService.decryptPayload(encryptedPayload, masterKey);
   *
   * // 3. Verify integrity: recompute the hash and compare it with the on-chain hash
   * const isValid = await cryptoService.verifyInvoiceIntegrity(localDetails, chainRecord.invoice_hash);
   * ```
   *
   * @param jsonString Decrypted JSON string (from wallet.requestRecords())
   * @returns Parsed Record data object
   * @throws {CryptoServiceError} If the JSON format is invalid or is in record1... encrypted format
   */
  parseAleoRecord<T = AleoInvoiceRecord>(jsonString: string): Promise<T>;

  /**
   * Verify invoice integrity: compare the hash of local details with the on-chain stored hash
   *
   * Wave 2: When context is provided, recomputes hash using same context as creation.
   *
   * @param localDetails Locally stored invoice details (decrypted from IndexedDB)
   * @param chainInvoiceHash The invoice_hash field from the on-chain Record
   * @param context Optional Wave 2 context (must match the context used at creation)
   * @returns true indicates data is intact and untampered, false indicates data inconsistency
   */
  verifyInvoiceIntegrity(
    localDetails: InvoiceDetails,
    chainInvoiceHash: AleoField,
    chainContext?: InvoiceHashChainContext,
    options?: { expectedChainHash?: AleoField; mode?: 'chain' | 'recompute' }
  ): Promise<boolean>;

  /**
   * Local encryption: encrypt invoice details and store them in IndexedDB
   * Uses PBKDF2 key derivation + AES-GCM symmetric encryption
   *
   * @param details Original invoice details
   * @param masterKey User's locally derived key (string format)
   * @returns Encrypted payload (containing iv and ciphertext)
   */
  encryptPayload(details: InvoiceDetails, masterKey: string): Promise<EncryptedPayload>;

  /**
   * Local decryption: read and decrypt invoice details from IndexedDB
   *
   * @param payload Encrypted payload
   * @param masterKey User's locally derived key
   * @returns Decrypted invoice details
   * @throws {CryptoServiceError} DECRYPTION_FAILED if the key is incorrect or data is corrupted
   */
  decryptPayload(payload: EncryptedPayload, masterKey: string): Promise<InvoiceDetails>;

  /**
   * Encrypt invoice details with a key derived from invoiceId (shared key: seller and buyer can both derive).
   * Used for online KV store (§3.9) so buyer can decrypt without seller's masterKey.
   */
  encryptPayloadWithInvoiceId(details: InvoiceDetails, invoiceId: string): Promise<EncryptedPayload>;

  /**
   * Decrypt payload that was encrypted with encryptPayloadWithInvoiceId.
   */
  decryptPayloadWithInvoiceId(payload: EncryptedPayload, invoiceId: string): Promise<InvoiceDetails>;

  /**
   * Decrypt payload with raw Uint8Array key (for audit package validation).
   */
  decryptWithRawKey(
    payload: EncryptedPayload,
    encryptionKey: Uint8Array
  ): Promise<InvoiceDetails>;

  /**
   * Wrap master key with device key (AES-GCM) for localStorage persistence.
   * Same device can later unwrap without re-signing.
   */
  wrapMasterKeyWithDeviceKey(
    masterKey: string,
    deviceKeyBytes: Uint8Array
  ): Promise<EncryptedPayload>;

  /**
   * Unwrap master key from device-key-encrypted payload.
   */
  unwrapMasterKeyWithDeviceKey(
    payload: EncryptedPayload,
    deviceKeyBytes: Uint8Array
  ): Promise<string>;

  /**
   * Derive a master key from a signature (used for local encryption of invoice details)
   *
   * Use cases:
   * - When the user creates an invoice for the first time, authorization is needed to access private invoice data
   * - Obtain a signature by signing a message, then derive the master key from the signature
   * - The master key is used to encrypt/decrypt invoice details stored in IndexedDB
   *
   * Implementation notes:
   * 1. Hash the signature using SHA-256
   * 2. Convert the hash result to a hexadecimal string
   * 3. Return the string as the masterKey (PBKDF2 will further derive the encryption key)
   *
   * Security:
   * - The signature is the user's wallet private key signing a specific message, providing uniqueness and non-forgeability
   * - SHA-256 ensures randomness and security of the key
   * - The same signature always produces the same master key (deterministic derivation)
   *
   * @param signature Wallet-signed message (from signMessage)
   * @returns Master key string (used for subsequent encryption/decryption)
   * @throws {CryptoServiceError} May throw ENCRYPTION_FAILED
   */
  deriveMasterKey(signature: string): Promise<string>;

  /**
   * Generate a random audit key for audit package encryption
   * 
   * Generates a cryptographically secure random 32-byte key
   * and returns it as a 64-character hexadecimal string.
   * 
   * Use case: Creating new audit packages. Each audit package
   * should have a unique random key for encryption.
   * 
   * Security: Uses crypto.getRandomValues() which provides
   * cryptographically strong random values suitable for security purposes.
   * 
   * @returns Random audit key as hex string (64 characters)
   * @throws {CryptoServiceError} May throw ENCRYPTION_FAILED if random generation fails
   */
  generateAuditKey(): string;

  /**
   * Convert hex audit key string to Uint8Array
   * 
   * Used by audit package generation to convert the random hex key
   * into a format suitable for AES-GCM encryption
   *
   * @param auditKey Hex string audit key (e.g., from generateAuditKey())
   * @returns Uint8Array suitable for encryption
   * @throws {CryptoServiceError} May throw ENCRYPTION_FAILED if format is invalid
   */
  auditKeyToBytes(auditKey: string): Uint8Array;

  /**
   * Hash encrypted payload (SHA-256 of iv + ciphertext)
   * 
   * Used for audit package integrity verification. This hash is signed
   * and included in the audit package to detect tampering.
   *
   * @param payload Encrypted payload containing iv and ciphertext
   * @returns Hex hash string (64 characters)
   * @throws {CryptoServiceError} May throw ENCRYPTION_FAILED
   */
  hashCipher(payload: EncryptedPayload): Promise<string>;

  /**
   * SHA-256 hash of UTF-8 string to hex (e.g. for canonical payload integrity).
   */
  hashUtf8ToHex(input: string): Promise<string>;

  /**
   * Encrypt invoice details with raw audit key (without PBKDF2 derivation)
   * 
   * Unlike encryptPayload which uses a master key string,
   * this method accepts a raw Uint8Array key directly for audit packages.
   * No key derivation is performed.
   *
   * Use case: Audit package generation where the audit key is already
   * a random 32-byte key suitable for AES-GCM.
   *
   * @param details Invoice details or partial invoice to encrypt
   * @param auditKey Raw encryption key as Uint8Array (32 bytes)
   * @returns Encrypted payload
   * @throws {CryptoServiceError} May throw ENCRYPTION_FAILED
   */
  encryptWithAuditKey(
    details: InvoiceDetails | Partial<any>,
    auditKey: Uint8Array
  ): Promise<EncryptedPayload>;

  /**
   * Evaluate audit rules (R1–R5) and return rules hash + per-rule flags.
   */
  evaluateAuditRules(input: {
    amount: bigint;
    taxAmount: bigint;
    dueDate: number;
    currentTime: number;
    lineItemsSum: bigint;
    expectedTotal: bigint;
    taxRateBps: bigint;
    invoiceHash: AleoField;
  }): Promise<{ rulesHash: AleoField; r1: boolean; r2: boolean; r3: boolean; r4: boolean; r5: boolean }>;

  /**
   * Wave 3: 在前端计算 BHP256::hash_to_field(TaxGroups)，结果作为合约的 tax_tag 输入
   */
  hashTaxGroups(groups: TaxGroups): Promise<AleoField>;

  /**
   * Wave 3: 将 13 位 T 号码字符串转为 u64 并计算 BHP256::hash_to_field，结果作为合约的 jct_registration 输入
   */
  hashTNumber(tNumber: string): Promise<AleoField>;

  /**
   * Wave 3: 将 TaxGroups 序列化为合约兼容的 Leo struct 字符串
   */
  serializeTaxGroupsForContract(groups: TaxGroups): string;

  /**
   * Wave 3: 本地执行 tax_tag 三项验证（A/B/C），与合约电路对齐
   * A: group.net_sum * group.rate_bps / 10000 == group.tax_sum
   * B: BHP256(TaxGroups) == tax_tag
   * C: sum(net_sum + tax_sum) == total_amount
   */
  verifyTaxTag(params: {
    taxGroups: TaxGroups;
    taxTag: AleoField;
    totalAmount: bigint;
  }): Promise<{
    a: { ok: boolean; detail?: string };
    b: { ok: boolean; detail?: string };
    c: { ok: boolean; detail?: string };
    allPassed: boolean;
  }>;
}
