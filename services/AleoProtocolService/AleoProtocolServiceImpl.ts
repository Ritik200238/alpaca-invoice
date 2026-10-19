import {
  AleoAddress,
  AleoField,
  AleoTransactionId,
  InvoiceStatus,
  Microcredits
} from '@/lib/types';
import { Network } from '@provablehq/aleo-types';
import { IAleoProtocolService, ProtocolServiceError, ProtocolError } from './IAleoProtocolService';
import type { AleoNetworkClient, ProgramManager } from '@provablehq/sdk';
import { PROGRAM_ID, CREDITS_PROGRAM_ID, USDCX_PROGRAM_ID } from '@/lib/contract';
import { createInvoiceRegistryService } from '@/services/InvoiceRegistryService/createInvoiceRegistryService';

let sdkPromise: Promise<typeof import('@provablehq/sdk')> | null = null;
const loadSdk = async () => {
  if (!sdkPromise) {
    sdkPromise = import('@provablehq/sdk');
  }
  return sdkPromise;
};

const WORKER_TIMEOUT_MS = 120_000;

/** Wave 3.1 outputs */
export const WAVE3_CREDITS_OUTPUT_COUNT = 6; // pay_invoice_credits_private returns 6 outputs
export const WAVE3_USDCX_OUTPUT_COUNT = 4;   // pay_invoice_usdcx returns 4 outputs (public-as-signer path)

/**
 * AleoProtocolService implementation class
 *
 * Responsibilities: Interacts with Aleo blockchain nodes to query on-chain data and broadcast transactions
 *
 * Uses @provablehq/sdk's AleoNetworkClient to automatically handle URL construction and version compatibility
 */
export class AleoProtocolService implements IAleoProtocolService {
  private networkClient: AleoNetworkClient | null = null;
  private programManager: ProgramManager | null = null;
  private network: Network;
  private baseUrl: string;
  private programSourceCache: string | null = null;
  private readonly registry = createInvoiceRegistryService(this as any);
  private worker: Worker | null = null;
  private workerRequests = new Map<
    string,
    {
      resolve: (outputs: string[]) => void;
      reject: (error: any) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(network: Network = Network.TESTNET) {
    this.network = network;
    this.baseUrl = this.getBaseUrlForNetwork(network);
  }

  /**
   * Lazily load SDK clients (browser-only; avoids SSR WASM fetch)
   */
  private async getNetworkClient(): Promise<AleoNetworkClient> {
    if (!this.networkClient) {
      const sdk = await loadSdk();
      this.networkClient = new sdk.AleoNetworkClient(this.baseUrl);
    }
    return this.networkClient;
  }

  private async getProgramManager(): Promise<ProgramManager> {
    if (!this.programManager) {
      const sdk = await loadSdk();
      this.programManager = new sdk.ProgramManager(this.baseUrl);
      // A throwaway account is required for local-only execution (pm.run).
      // These computations are pure functions — no funds are spent.
      const tempPrivateKey = new sdk.PrivateKey();
      this.programManager.setAccount(new sdk.Account({ privateKey: tempPrivateKey.to_string() }));
    }
    return this.programManager;
  }

  private async getProgramSource(): Promise<string> {
    if (this.programSourceCache) return this.programSourceCache;
    const client = await this.getNetworkClient();
    const src = await client.getProgram(PROGRAM_ID);
    if (!src || typeof src !== 'string') {
      throw new ProtocolServiceError(
        ProtocolError.NODE_CONNECTION_FAILED,
        'Failed to fetch program source for compute_invoice_id',
        { programId: PROGRAM_ID }
      );
    }
    this.programSourceCache = src;
    return src;
  }

  private isWorkerEnv(): boolean {
    return false; // Worker disabled
  }

  private getWorker(): Worker | null {
    return null;
  }

  private async runInWorker(params: { program: string; functionName: string; inputs: any[] }): Promise<string[]> {
    const worker = this.getWorker();
    if (!worker) throw new Error('worker_unavailable');
    const id = (globalThis.crypto as any)?.randomUUID?.() ?? `wrk-${Date.now()}-${Math.random()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.workerRequests.delete(id);
        reject(
          new ProtocolServiceError(
            ProtocolError.SYNC_TIMEOUT,
            `Worker execution timeout for ${params.functionName}`,
            { functionName: params.functionName, timeoutMs: WORKER_TIMEOUT_MS }
          )
        );
      }, WORKER_TIMEOUT_MS);
      this.workerRequests.set(id, { resolve, reject, timer });
      worker.postMessage({ id, type: 'run', payload: { ...params, baseUrl: this.baseUrl } });
    });
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    functionName: string,
    inputs: any[],
    timeoutMs: number = WORKER_TIMEOUT_MS
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new ProtocolServiceError(
            ProtocolError.SYNC_TIMEOUT,
            'Program execution timeout',
            { functionName, timeoutMs, inputsLength: inputs.length }
          )
        );
      }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timer) clearTimeout(timer);
    }) as Promise<T>;
  }

  private addFieldSuffix(value: string): string {
    return value.endsWith('field') ? value : `${value}field`;
  }

  /** Normalize SDK types to bits using Leo-compatible plaintext serialization when available. */
  private toBitsLe(value: any): boolean[] {
    // Force plaintext path when possible to match Leo/contract hashing
    if (value && typeof value.toPlaintext === 'function') {
      const pt = value.toPlaintext();
      if (pt && typeof pt.toBitsLe === 'function') {
        return pt.toBitsLe();
      }
    }
    if (value && typeof value.toBitsLe === 'function') {
      return value.toBitsLe();
    }
    throw new Error('Unsupported value for toBitsLe');
  }

  private async computeInvoiceHashLocal(inputs: string[]): Promise<string[]> {
    const sdk = await loadSdk();
    const literal = `{ seller: ${inputs[0]}, buyer: ${inputs[1]}, amount: ${inputs[2]}, tax_amount: ${inputs[3]}, due_date: ${inputs[4]}, nonce: ${inputs[5]}, order_id: ${inputs[6]}, currency: ${inputs[7]}, items_hash: ${inputs[8]}, memo_hash: ${inputs[9]} }`;
    const pt = (sdk as any).Plaintext.fromString(literal);
    const bits = pt.toBitsLe();
    const hash = new sdk.BHP256().hash(bits).toString();
    return [this.addFieldSuffix(hash)];
  }

  private async computeInvoiceIdLocal(inputs: string[]): Promise<string[]> {
    const sdk = await loadSdk();
    const literal = `{ seller: ${inputs[0]}, buyer: ${inputs[1]}, amount: ${inputs[2]}, due_date: ${inputs[3]}, nonce: ${inputs[4]} }`;
    const pt = (sdk as any).Plaintext.fromString(literal);
    const bits = pt.toBitsLe();
    const hash = new sdk.BHP256().hash(bits).toString();
    return [this.addFieldSuffix(hash)];
  }

  // Wave 3: PaymentCommitData { invoice_id: field, amount: u64, nonce: field }
  private async computeSettlementAnchorLocal(inputs: string[]): Promise<string[]> {
    const sdk = await loadSdk();
    const literal = `{ invoice_id: ${inputs[0]}, amount: ${inputs[1]}, nonce: ${inputs[2]} }`;
    const pt = (sdk as any).Plaintext.fromString(literal);
    const bits = pt.toBitsLe();
    const hash = new sdk.BHP256().hash(bits).toString();
    return [this.addFieldSuffix(hash)];
  }

  /**
   * Central dispatch for local Aleo program execution.
   * Browser → Web Worker (avoids UI freeze); SSR/test → direct pm.run.
   */
  private async runProgram(
    functionName: string,
    inputs: any[],
    programSource?: string,
    timeoutMs: number = WORKER_TIMEOUT_MS
  ): Promise<string[]> {
    // Fast path for hash/id using local BHP with proper plaintext serialization
    if (functionName === 'compute_invoice_hash') {
      return await this.computeInvoiceHashLocal(inputs as string[]);
    }
    if (functionName === 'compute_invoice_id') {
      return await this.computeInvoiceIdLocal(inputs as string[]);
    }
    if (functionName === 'compute_settlement_anchor') {
      return await this.computeSettlementAnchorLocal(inputs as string[]);
    }

    // For other functions, fall back to pm.run
    const program = programSource ?? (await this.getProgramSource());
    const pm = await this.getProgramManager();
    const response = await this.withTimeout(pm.run(program, functionName, inputs, false), functionName, inputs, timeoutMs);
    const outputs = (response as any)?.getOutputs ? (response as any).getOutputs() : (response as any)?.outputs;
    if (!outputs) {
      throw new ProtocolServiceError(
        ProtocolError.INVALID_RECORD,
        `Program execution returned no output for ${functionName}`,
        { functionName, inputsLength: inputs.length }
      );
    }
    return outputs as string[];
  }

  /**
   * Compute invoice_id deterministically by running compute_invoice_id locally (no fee).
   * Falls back to on-chain program source fetched via Aleo explorer.
   */
  async computeInvoiceIdOffline(params: {
    seller: AleoAddress;
    buyer: AleoAddress;
    amount: Microcredits;
    dueDate: number;
    nonce: AleoField;
  }): Promise<AleoField> {
    const inputs = [
      params.seller,
      params.buyer,
      `${params.amount.toString()}u64`,
      `${params.dueDate}u32`,
      params.nonce
    ];
    const outputs = await this.runProgram('compute_invoice_id', inputs);
    if (!outputs || !outputs[0]) {
      throw new ProtocolServiceError(
        ProtocolError.INVALID_RECORD,
        'compute_invoice_id returned empty output',
        { inputs }
      );
    }
    return String(outputs[0]) as AleoField;
  }

  /**
   * Compute invoice_hash deterministically via contract helper (no fee).
   */
  async computeInvoiceHashOffline(params: {
    seller: AleoAddress;
    buyer: AleoAddress;
    amount: Microcredits;
    taxAmount: Microcredits;
    dueDate: number;
    nonce: AleoField;
    orderId: AleoField;
    currency: AleoField;
    itemsHash: AleoField;
    memoHash: AleoField;
  }): Promise<AleoField> {
    const inputs = [
      params.seller,
      params.buyer,
      `${params.amount.toString()}u64`,
      `${params.taxAmount.toString()}u64`,
      `${params.dueDate}u32`,
      params.nonce,
      params.orderId,
      params.currency,
      params.itemsHash,
      params.memoHash
    ];
    const outputs = await this.runProgram('compute_invoice_hash', inputs);
    if (!outputs || !outputs[0]) {
      throw new ProtocolServiceError(
        ProtocolError.INVALID_RECORD,
        'compute_invoice_hash returned empty output',
        { inputs }
      );
    }
    return String(outputs[0]) as AleoField;
  }

  /**
   * Wave 3: Compute settlement_anchor = BHP256(PaymentCommitData{invoice_id, amount, nonce}) locally.
   * Matches pay_invoice_credits_private commitment in main.leo.
   */
  async computeSettlementAnchorOffline(params: {
    invoiceId: AleoField;
    amount: Microcredits;
    nonce: AleoField;
  }): Promise<AleoField> {
    const inputs = [
      params.invoiceId,
      `${params.amount.toString()}u64`,
      params.nonce
    ];
    const outputs = await this.runProgram('compute_settlement_anchor', inputs);
    if (!outputs || !outputs[0]) {
      throw new ProtocolServiceError(
        ProtocolError.INVALID_RECORD,
        'compute_settlement_anchor returned empty output',
        { inputs }
      );
    }
    return String(outputs[0]) as AleoField;
  }

  /**
   * Get base RPC URL based on network type (for AleoNetworkClient)
   */
  private getBaseUrlForNetwork(network: Network): string {
    switch (network) {
      case Network.MAINNET:
        return 'https://api.explorer.provable.com/v1';
      case Network.TESTNET:
      case Network.CANARY:
        return 'https://api.explorer.provable.com/v1';
      default:
        return 'https://api.explorer.provable.com/v1';
    }
  }

  /**
   * Get the latest block height of the current chain
   *
   * Uses AleoNetworkClient.getLatestHeight() to directly retrieve the latest block height
   */
  async getLatestBlockHeight(): Promise<number> {
    try {
      const client = await this.getNetworkClient();
      const height = await client.getLatestHeight();

      if (!height || height < 0) {
        throw new ProtocolServiceError(
          ProtocolError.NODE_CONNECTION_FAILED,
          'Failed to fetch latest block height: invalid response',
          { height }
        );
      }

      return height;
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      throw new ProtocolServiceError(
        ProtocolError.NODE_CONNECTION_FAILED,
        'Failed to connect to Aleo node',
        { originalError: error }
      );
    }
  }

  /**
   * Get public balance (queried from on-chain Mapping)
   * Queries the account mapping of the credits.aleo program
   *
   * Uses AleoNetworkClient.getProgramMappingValue; returns 0 if the result is null
   */
  async getPublicBalance(address: AleoAddress): Promise<Microcredits> {
    try {
      const client = await this.getNetworkClient();
      const balance = await client.getProgramMappingValue(
        CREDITS_PROGRAM_ID,
        'account',
        address
      );

      // If null is returned, balance is 0
      if (balance === null || balance === undefined) {
        return 0n;
      }

      // Process the returned balance value (may be a string or number)
      const balanceStr = String(balance).trim();

      // Remove possible unit suffix (e.g., "u64") and parse as bigint
      const cleanBalanceStr = balanceStr
        .replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
        .replace(/u64$/i, '') // Remove u64 suffix (case-insensitive)
        .trim();

      return BigInt(cleanBalanceStr || 0);
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      // Network error or other errors, return 0 (the address may not have a public balance)
      console.warn('Failed to get public balance, returning 0:', error);
      return 0n;
    }
  }

  /**
   * Get all encrypted Records for a specified address under a specific program
   *
   * Note: This method requires a private key to decrypt Records.
   * AleoNetworkClient.findUnspentRecords requires a PrivateKey parameter.
   *
   * It is recommended to handle Record queries in the upper-layer Service (e.g., WalletService),
   * since only the Wallet layer holds the user's private key.
   *
   * For implementation reference:
   * const records = await this.networkClient.findUnspentRecords(
   *   startHeight,
   *   undefined,
   *   privateKey,
   *   undefined,
   *   undefined
   * );
   */
  async fetchRawRecords(
    programId: string,
    address: AleoAddress,
    startHeight: number
  ): Promise<string[]> {
    throw new ProtocolServiceError(
      ProtocolError.INVALID_RECORD,
      'Record fetching requires private key and should be handled by WalletService',
      { programId, address, startHeight }
    );
  }

  /**
   * Query on-chain program Mapping value (generic method)
   *
   * Can query any Mapping of any program, for example:
   * - credits.aleo account mapping (balance query)
   * - zk_invoice_v3_1.aleo invoice_status mapping (invoice status query)
   * - Any custom program's Mapping
   *
   * @param programId Program identifier (e.g., "zk_invoice_v3_1.aleo")
   * @param mappingName Mapping name (e.g., "invoice_status")
   * @param key Mapping key (Field type or Aleo address, depending on mapping definition)
   * @returns Mapping value (string format), or null if it does not exist
   * @throws {ProtocolServiceError} May throw NODE_CONNECTION_FAILED
   */
  async getProgramMappingValue(
    programId: string,
    mappingName: string,
    key: AleoField | AleoAddress
  ): Promise<string | null> {
    try {
      const client = await this.getNetworkClient();
      const value = await client.getProgramMappingValue(
        programId,
        mappingName,
        key
      );

      // If null or undefined is returned, the key does not exist in the Mapping
      if (value === null || value === undefined) {
        return null;
      }

      // Return the value in string format (may include type suffixes such as "123u64", "0u8", etc.)
      return String(value);
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      // Aleo explorer returns 404 when a mapping key does not exist.
      // Treat this as "not found" rather than a network failure.
      const msg = String(error?.message ?? error ?? '');
      const status = error?.status ?? error?.statusCode ?? error?.response?.status ?? 0;
      const is404 =
        status === 404 ||
        msg.includes('404') ||
        msg.toLowerCase().includes('not found') ||
        msg.toLowerCase().includes('key not found');
      if (is404) {
        return null;
      }

      // Genuine network error
      throw new ProtocolServiceError(
        ProtocolError.NODE_CONNECTION_FAILED,
        'Failed to query program mapping value',
        { programId, mappingName, key, originalError: error }
      );
    }
  }

  async verifyInvoiceOnChain(
    invoiceId: AleoField,
    localHash: AleoField
  ): Promise<{
    exists: boolean;
    hashMatch: boolean;
    chainStatus: InvoiceStatus | null;
  }> {
    const chainHash = await this.registry.getInvoiceHash(invoiceId);
    const exists = chainHash !== null;
    const hashMatch = exists ? chainHash === localHash : false;
    const chainStatus = await this.registry.getInvoiceStatus(invoiceId);
    return { exists, hashMatch, chainStatus };
  }

  async assertRules(invoiceId: AleoField, rulesHash: AleoField): Promise<void> {
    await this.callAssert('assert_rules_anchor', [invoiceId, rulesHash]);
  }

  async assertAmount(
    invoice: any,
    expectedHash: AleoField,
    min: bigint,
    max: bigint
  ): Promise<void> {
    await this.callAssert('assert_amount_anchor', [
      invoice,
      expectedHash,
      `${min.toString()}u64`,
      `${max.toString()}u64`
    ]);
  }

  async assertOwnership(
    invoice: any,
    expectedHash: AleoField,
    seller: AleoAddress,
    buyer: AleoAddress
  ): Promise<void> {
    await this.callAssert('assert_ownership_anchor', [invoice, expectedHash, seller, buyer]);
  }

  async assertCommitment(invoiceId: AleoField, root: AleoField): Promise<void> {
    await this.callAssert('assert_commitment_anchor', [invoiceId, root]);
  }

  async assertCounter(seller: AleoAddress, expected: bigint): Promise<void> {
    await this.callAssert('assert_audit_counter_anchor', [seller, `${expected.toString()}u64`]);
  }

  private async callAssert(functionName: string, inputs: any[]): Promise<void> {
    const outputs = await this.runProgram(functionName, inputs);
    if (outputs === undefined || outputs === null) {
      throw new ProtocolServiceError(
        ProtocolError.TRANSACTION_REJECTED,
        `Assert call failed: ${functionName}`,
        { inputs }
      );
    }
  }

  /**
   * Broadcast a generated zero-knowledge proof transaction to the Aleo network
   *
   * Uses AleoNetworkClient.submitTransaction to submit the transaction
   */
  async broadcastTransaction(transactionPayload: any): Promise<AleoTransactionId> {
    try {
      const client = await this.getNetworkClient();
      const txId = await client.submitTransaction(transactionPayload);

      if (!txId || !txId.startsWith('at1')) {
        throw new ProtocolServiceError(
          ProtocolError.TRANSACTION_REJECTED,
          'Invalid transaction ID returned',
          { txId }
        );
      }

      return txId as AleoTransactionId;
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      throw new ProtocolServiceError(
        ProtocolError.TRANSACTION_REJECTED,
        'Failed to broadcast transaction',
        { originalError: error }
      );
    }
  }

  /**
   * Wait for transaction confirmation
   *
   * Polls getTransaction to check the transaction status
   */
  async waitForTransaction(txId: AleoTransactionId, timeoutMS: number = 60000): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 2000; // Poll every 2 seconds
    const client = await this.getNetworkClient();

    while (Date.now() - startTime < timeoutMS) {
      try {
        const transaction = await client.getTransaction(txId);

        if (transaction) {
          // Transaction confirmed
          return transaction;
        }
      } catch (error) {
        // Transaction may not have been received by the node yet, continue polling
        console.debug('Transaction not found yet, continuing to poll:', txId);
      }

      // Wait for the next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout
    throw new ProtocolServiceError(
      ProtocolError.SYNC_TIMEOUT,
      'Transaction confirmation timeout',
      { txId, timeoutMS }
    );
  }

  /**
   * Estimate execution fee (Microcredits)
   *
   * Builds an Authorization and uses the SDK's estimateFeeForAuthorization for estimation
   * Adds 20% buffer to ensure the transaction can be successfully executed
   *
   * If SDK estimation fails, returns a fallback value: 250,000 microcredits (0.25 credits)
   */
  async estimateExecutionFee(
    programName: string,
    functionName: string,
    inputs: string[]
  ): Promise<Microcredits> {
    try {
      const programManager = await this.getProgramManager();

      // Step 1: Build Authorization object
      // This object contains the complete transaction description but hasn't generated the expensive ZK proof yet
      const authorization = await programManager.buildAuthorization({
        programName,
        functionName,
        inputs,
        // If the program hasn't been deployed or is local, you can pass in programSource
        // But usually it's not needed since the SDK will fetch from the network
      });

      // Step 2: Use estimateFeeForAuthorization for estimation
      const baseFeeMicrocredits = await programManager.estimateFeeForAuthorization({
        authorization,
        programName: 'credits.aleo', // Fee payment program
      });

      // Step 3: Convert and add 20% buffer
      const fee = BigInt(baseFeeMicrocredits);
      const feeWithBuffer = (fee * 120n) / 100n; // Add 20% buffer

      return feeWithBuffer;
    } catch (error: any) {
      console.error('SDK fee estimation failed:', error);

      // If it's a ProtocolServiceError, rethrow directly
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      // Fallback: return a hardcoded empirical value
      // 250,000 microcredits = 0.25 credits
      // This is a conservative estimate suitable for most simple contract calls
      console.warn('Using fallback fee estimate: 250,000 microcredits');
      return 250_000n;
    }
  }

  /**
   * Return the expected number of outputs for a given transition (Wave 3).
   * Use this when calling verifyRecordOnChain so output count verification matches the contract.
   */
  getExpectedOutputCountForFunction(functionName: string): number | undefined {
    if (functionName === 'pay_invoice_credits_private') {
      return WAVE3_CREDITS_OUTPUT_COUNT;
    }
    if (functionName === 'pay_invoice_usdcx') {
      return WAVE3_USDCX_OUTPUT_COUNT;
    }
    return undefined;
  }

  /**
   * Verify whether a generated record has been successfully committed on-chain
   *
   * Verifies transaction confirmation by querying transaction details, and optionally
   * validates whether the transaction contains the expected records
   *
   * Verification logic:
   * 1. Check if the transaction exists and is confirmed
   * 2. If programId is provided, verify the transaction belongs to that program
   * 3. If functionName is provided, verify the function name called by the transaction
   * 4. If expectedOutputsCount is provided, verify the number of output records produced by the transaction
   *
   * Wave 3: For pay_invoice_credits_private use expectedOutputsCount: WAVE3_CREDITS_OUTPUT_COUNT (6);
   *         pay_invoice_usdcx uses WAVE3_USDCX_OUTPUT_COUNT (7).
   */
  async verifyRecordOnChain(
    transactionId: AleoTransactionId,
    options?: {
      programId?: string;
      functionName?: string;
      expectedOutputsCount?: number;
    }
  ): Promise<{
    verified: boolean;
    transaction: any;
    message: string;
  }> {
    try {
      // Step 1: Query transaction details
      const client = await this.getNetworkClient();
      const transaction = await client.getTransaction(transactionId);

      if (!transaction) {
        return {
          verified: false,
          transaction: null,
          message: `Transaction ${transactionId} not found on chain`
        };
      }

      // Step 2: Verify the transaction is confirmed (existence implies confirmation)
      // If a transaction is rejected or fails, it typically won't appear on chain, so existence is assumed to mean success

      // Cast the transaction object to any for safe access to dynamic properties
      const tx = transaction as any;

      // Step 3: If programId is provided, verify the transaction belongs to that program
      if (options?.programId) {
        // Check if the transaction's transitions contain the specified program
        const transitions = tx.transitions || tx.execution?.transitions || [];
        const hasMatchingProgram = transitions.some((transition: any) => {
          const program = transition.program || transition.id?.program || '';
          return program === options.programId || program.includes(options.programId);
        });

        if (!hasMatchingProgram) {
          return {
            verified: false,
            transaction,
            message: `Transaction does not belong to program ${options.programId}`
          };
        }
      }

      // Step 4: If functionName is provided, verify the function name called by the transaction
      if (options?.functionName) {
        const transitions = tx.transitions || tx.execution?.transitions || [];
        const hasMatchingFunction = transitions.some((transition: any) => {
          const functionName = transition.function || transition.id?.function || '';
          return functionName === options.functionName;
        });

        if (!hasMatchingFunction) {
          return {
            verified: false,
            transaction,
            message: `Transaction does not call function ${options.functionName}`
          };
        }
      }

      // Step 5: If expectedOutputsCount is provided, verify the number of output records
      if (options?.expectedOutputsCount !== undefined) {
        // Try to extract the number of output records from the transaction
        // Different transaction format versions may differ, so handle compatibly
        let actualOutputsCount = 0;

        // Method 1: Get from execution.outputs
        if (tx.execution?.outputs) {
          actualOutputsCount = tx.execution.outputs.length;
        }
        // Method 2: Get from transitions' outputs
        else if (tx.transitions || tx.execution?.transitions) {
          const transitions = tx.transitions || tx.execution.transitions || [];
          actualOutputsCount = transitions.reduce((count: number, transition: any) => {
            const outputs = transition.outputs || [];
            return count + outputs.length;
          }, 0);
        }
        // Method 3: Get from transaction.outputs
        else if (tx.outputs) {
          actualOutputsCount = tx.outputs.length;
        }

        if (actualOutputsCount !== options.expectedOutputsCount) {
          return {
            verified: false,
            transaction,
            message: `Expected ${options.expectedOutputsCount} output records, but found ${actualOutputsCount}`
          };
        }
      }

      // All verifications passed
      return {
        verified: true,
        transaction,
        message: `Transaction ${transactionId} verified successfully on chain`
      };
    } catch (error: any) {
      if (error instanceof ProtocolServiceError) {
        throw error;
      }

      // If the query fails, the transaction may not exist or there may be a network error
      throw new ProtocolServiceError(
        ProtocolError.NODE_CONNECTION_FAILED,
        'Failed to verify record on chain',
        { transactionId, originalError: error }
      );
    }
  }

  async getUsdcxAllowance(owner: AleoAddress, spender: AleoAddress): Promise<bigint> {
    if (!USDCX_PROGRAM_ID) return 0n;
    try {
      // Key format depends on USDCx contract: often (owner, spender) composite; try composite key string
      const key = `${owner},${spender}`;
      const raw = await this.getProgramMappingValue(
        USDCX_PROGRAM_ID,
        'allowance',
        key as AleoField
      );
      if (raw == null) return 0n;
      const s = String(raw).replace(/^["']|["']$/g, '').replace(/u64$/i, '').trim();
      return BigInt(s || 0);
    } catch {
      return 0n;
    }
  }

  async getPublicTransfersByTxId(txId: AleoTransactionId): Promise<Array<{
    from: AleoAddress;
    to: AleoAddress;
    amount: bigint;
  }>> {
    const client = await this.getNetworkClient();
    const tx = await client.getTransaction(txId);
    if (!tx) return [];
    const out: Array< { from: AleoAddress; to: AleoAddress; amount: bigint }> = [];
    const t = tx as any;
    const transitions = t.transitions ?? t.execution?.transitions ?? [];
    for (const tr of transitions) {
      const outputs = tr.outputs ?? [];
      for (const o of outputs) {
        const str = typeof o === 'string' ? o : (o.value ?? o);
        if (!str || typeof str !== 'string') continue;
        // credits.aleo transfer_public: amount and optional address outputs
        const m = str.match(/amount:(\d+)u64/);
        if (m) {
          const amount = BigInt(m[1]);
          // Try to get from/to from transition inputs or id
          const from = (tr.inputs?.[0] ?? tr.id?.inputs?.[0]) ?? '';
          const to = (tr.inputs?.[1] ?? tr.id?.inputs?.[1]) ?? '';
          if (from && to) {
            out.push({
              from: from as AleoAddress,
              to: to as AleoAddress,
              amount
            });
          }
        }
      }
    }
    return out;
  }
}
