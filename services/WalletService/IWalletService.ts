import type { AleoTransactionId } from '@/lib/types';
import { createServiceError } from '@/lib/service-errors';

/**
 * Wallet service error codes
 */
export enum WalletError {
  NOT_INSTALLED = 'NOT_INSTALLED',             // Wallet extension not detected
  USER_REJECTED = 'USER_REJECTED',            // User clicked "Reject" or closed the extension popup
  INSUFFICIENT_FEE = 'INSUFFICIENT_FEE',     // Wallet does not have enough credits Records to pay the fee
  NETWORK_MISMATCH = 'NETWORK_MISMATCH',    // Wallet's current network does not match the application requirement (e.g., should be Testnet3)
  UNAUTHORIZED = 'UNAUTHORIZED',           // Called an authorized API without being connected
  DECRYPTION_FAILED = 'DECRYPTION_FAILED' // User rejected the decryption request or ViewKey derivation failed
}

/**
 * Wallet service error class
 * Created using a factory function, with automatic type hints
 */
export const WalletServiceError = createServiceError<WalletError>('WalletService');
export type WalletServiceError = InstanceType<typeof WalletServiceError>;

/**
 * Parameter interface for the requestTransaction method (simplified version)
 * Used by the WalletService.requestTransaction method
 */
export interface RequestTransactionParams {
  /** Function name to call */
  functionName: string;
  /** Array of function input parameters */
  inputs: string[];
  /** Wallet public key address */
  publicKey: string;
  /** Program ID (defaults to "zk_invoice_v3_1.aleo") */
  programId?: string;
  /** Optional fee Record (if not provided, wallet will auto-select) */
  feeRecord?: string;
  /** Fee amount (defaults to 250000 microcredits) */
  fee?: number;
  /** Chain ID (optional, defaults to value from environment variable) */
  chainId?: string;
}

/**
 * WalletService interface
 * Responsibility: encapsulate wallet operations, handle connection, signing, and decryption authorization
 *
 * Notes:
 * - Currently implemented as pure functions (see WalletServiceImpl.ts)
 * - This interface serves both as a service layer interface and as a type constraint for wallet instances
 */
export interface IWalletService {
  // Wallet connection methods
  /**
   * Request wallet connection
   * @throws {WalletServiceError} May throw NOT_INSTALLED, USER_REJECTED, NETWORK_MISMATCH
   */
  connect(): Promise<void>;

  /**
   * Disconnect wallet and reset authorization state
   */
  disconnect(): Promise<void>;

  /**
   * Sign a message (used for identity verification or audit authorization)
   * @param message Message to sign
   * @returns Signed string
   * @throws {WalletServiceError} May throw USER_REJECTED, UNAUTHORIZED
   */
  signMessage?(message: string): Promise<string>;

  /**
   * Request Records
   */
  requestRecords?(program: string): Promise<{ records: any[] }>;

  /**
   * Request Record plaintexts
   */
  requestRecordPlaintexts?(program: string): Promise<{ records: any[] }>;

  /**
   * Request transaction creation (raw method of the wallet adapter)
   * @param params Transaction parameters
   * @returns Transaction result (returns transactionId string)
   */
  requestTransaction?(params: {
    address: string;
    chainId: string;
    transitions: Array<{
      program: string;
      functionName: string;
      inputs: string[];
    }>;
    fee: number;
    feePrivate: boolean;
  }): Promise<string>;

  /**
   * Query transaction status
   * @param transactionId Transaction ID
   * @returns Transaction status string
   */
  transactionStatus?(transactionId: string): Promise<string>;

  /**
   * Wave 3: submit two sequential TXs (Approve + Pay).
   * If the adapter supports batch signing, one popup is enough; otherwise two requestTransaction calls are triggered sequentially.
   * @param txList TX parameter array executed in order (max 2)
   * @returns transactionId for each TX in the same order
   */
  requestSequentialTransactions?(
    txList: Array<{
      programId: string;
      functionName: string;
      inputs: string[];
      fee: number;
    }>
  ): Promise<AleoTransactionId[]>;
}
