import {
  AleoAddress,
  AleoField,
  AleoTransactionId,
  InvoiceStatus,
  Microcredits
} from '@/lib/types';
import { createServiceError } from '@/lib/service-errors';

/**
 * Protocol service error codes
 * Handles various risks in network and node communication
 */
export enum ProtocolError {
  NODE_CONNECTION_FAILED = 'NODE_CONNECTION_FAILED', // Unable to connect to Aleo node (RPC failure)
  INVALID_RECORD = 'INVALID_RECORD',           // Record format parsing error
  TRANSACTION_REJECTED = 'TRANSACTION_REJECTED', // Node rejected the transaction (e.g., insufficient fee or logic conflict)
  SYNC_TIMEOUT = 'SYNC_TIMEOUT',               // Block sync timeout
  MAPPING_NOT_FOUND = 'MAPPING_NOT_FOUND'      // Specified Mapping not found on-chain (e.g., program not deployed)
}

/**
 * Protocol service error class
 */
export const ProtocolServiceError = createServiceError<ProtocolError>('AleoProtocol');
export type ProtocolServiceError = InstanceType<typeof ProtocolServiceError>;

export interface IAleoProtocolService {
  /**
   * Get the latest block height of the current chain
   * Used by the Controller to determine the scan endpoint
   * @throws {ProtocolServiceError} May throw NODE_CONNECTION_FAILED
   */
  getLatestBlockHeight(): Promise<number>;

  /**
   * Get public balance (queried from on-chain Mapping)
   * Queries the account mapping of the credits.aleo program
   * @param address Aleo address
   * @returns Public balance (Microcredits)
   * @throws {ProtocolServiceError} May throw NODE_CONNECTION_FAILED
   */
  getPublicBalance(address: AleoAddress): Promise<Microcredits>;

  /**
   * Get all encrypted Records for a specified address under a specific program
   * @param programId Program identifier (e.g., "zk_invoice_v3_1.aleo")
   * @param address User address
   * @param startHeight Starting scan height
   * @returns Array of raw ciphertext strings
   * @throws {ProtocolServiceError} May throw NODE_CONNECTION_FAILED
   */
  fetchRawRecords(
    programId: string,
    address: AleoAddress,
    startHeight: number
  ): Promise<string[]>;

  /**
   * Query on-chain program Mapping values (generic method)
   * Can query any Mapping of any program
   * @param programId Program identifier (e.g., "zk_invoice_v3_1.aleo")
   * @param mappingName Mapping name (e.g., "invoice_status")
   * @param key Mapping key (Field type)
   * @returns Mapping value (string format), or null if it does not exist
   * @throws {ProtocolServiceError} May throw MAPPING_NOT_FOUND, NODE_CONNECTION_FAILED
   */
  getProgramMappingValue(
    programId: string,
    mappingName: string,
    key: AleoField
  ): Promise<string | null>;

  /**
   * Compute invoice_id locally by running compute_invoice_id (no fee).
   */
  computeInvoiceIdOffline(params: {
    seller: AleoAddress;
    buyer: AleoAddress;
    amount: Microcredits;
    dueDate: number;
    nonce: AleoField;
  }): Promise<AleoField>;

  /**
   * Wave 3: Compute settlement_anchor = BHP256(PaymentCommitData{invoice_id, amount, nonce}) locally.
   * Mirrors the contract's pay_invoice_credits_private commitment computation.
   */
  computeSettlementAnchorOffline(params: {
    invoiceId: AleoField;
    amount: Microcredits;
    nonce: AleoField;
  }): Promise<AleoField>;

  /**
   * On-chain assertions (wrapping contract assert_* transitions)
   */
  assertRules(invoiceId: AleoField, rulesHash: AleoField): Promise<void>;
  assertAmount(
    invoice: any,
    expectedHash: AleoField,
    min: bigint,
    max: bigint
  ): Promise<void>;
  assertOwnership(
    invoice: any,
    expectedHash: AleoField,
    seller: AleoAddress,
    buyer: AleoAddress
  ): Promise<void>;
  assertCommitment(invoiceId: AleoField, root: AleoField): Promise<void>;
  assertCounter(seller: AleoAddress, expected: bigint): Promise<void>;

  /**
   * Verify invoice hash matches on-chain anchor and return status.
   */
  verifyInvoiceOnChain(
    invoiceId: AleoField,
    localHash: AleoField
  ): Promise<{
    exists: boolean;
    hashMatch: boolean;
    chainStatus: InvoiceStatus | null;
  }>;

  /**
   * Broadcast a generated zero-knowledge proof transaction to the Aleo network
   * @param transactionPayload Proof data payload
   * @returns The generated transaction ID
   * @throws {ProtocolServiceError} May throw TRANSACTION_REJECTED, NODE_CONNECTION_FAILED
   */
  broadcastTransaction(transactionPayload: any): Promise<AleoTransactionId>;

  /**
   * Wait for transaction confirmation
   * @param txId Transaction ID
   * @param timeoutMS Timeout in milliseconds
   * @returns Confirmation receipt information
   * @throws {ProtocolServiceError} May throw SYNC_TIMEOUT, NODE_CONNECTION_FAILED
   */
  waitForTransaction(txId: AleoTransactionId, timeoutMS?: number): Promise<any>;

  /**
   * Estimate execution fee (Microcredits)
   * Estimates by building an Authorization and using the SDK's estimateFeeForAuthorization
   * @param programName Program name (e.g., "zk_invoice_v3_1.aleo")
   * @param functionName Function name (e.g., "create_invoice")
   * @param inputs Array of function input parameters
   * @returns Estimated execution fee (Microcredits), with 20% buffer added
   * @throws {ProtocolServiceError} May throw NODE_CONNECTION_FAILED
   */
  estimateExecutionFee(
    programName: string,
    functionName: string,
    inputs: string[]
  ): Promise<Microcredits>;

  /**
   * Return the expected number of outputs for a transition (Wave 3.1).
   * pay_invoice_credits_private returns 6 outputs; pay_invoice_usdcx returns 4 outputs.
   */
  getExpectedOutputCountForFunction(functionName: string): number | undefined;

  /**
   * Wave 3: Query USDCx allowance (owner -> spender). Used to decide if Approve TX is needed before pay.
   */
  getUsdcxAllowance(owner: AleoAddress, spender: AleoAddress): Promise<bigint>;

  /**
   * Wave 3: Fetch public balance transfers for a TX (for Money Flow verification).
   */
  getPublicTransfersByTxId(txId: AleoTransactionId): Promise<Array<{ from: AleoAddress; to: AleoAddress; amount: bigint }>>;

  /**
   * Verify whether a generated record has been successfully committed on-chain
   * Verifies transaction confirmation by querying transaction details, and optionally verifies that the transaction contains the expected records
   * @param transactionId Transaction ID
   * @param options Optional verification options
   * @param options.programId Program ID (e.g., "zk_invoice_v3_1.aleo"), used to verify the transaction belongs to this program
   * @param options.functionName Function name (e.g., "create_invoice"), used to verify the function called by the transaction
   * @param options.expectedOutputsCount Expected number of output records; for pay_invoice_credits_private use getExpectedOutputCountForFunction (6); pay_invoice_usdcx use 7
   * @returns Verification result object, including success status, transaction details, etc.
   * @throws {ProtocolServiceError} May throw NODE_CONNECTION_FAILED, TRANSACTION_REJECTED
   */
  verifyRecordOnChain(
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
  }>;
}
