import { createServiceError } from '@/lib/service-errors';
import type {
  AleoField,
  Invoice,
  PaymentReceipt,
  CreditMetrics,
  CreditClaim,
} from '@/lib/types';

export enum CreditError {
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  CLAIM_NOT_MET = 'CLAIM_NOT_MET',
  PROOF_EXPIRED = 'PROOF_EXPIRED',
  PROOF_NOT_FOUND = 'PROOF_NOT_FOUND'
}

export const CreditServiceError = createServiceError<CreditError>('CreditService');
export type CreditServiceError = InstanceType<typeof CreditServiceError>;

/**
 * Service for computing local credit metrics and querying
 * on-chain credit proof data from zk_credit_v1_1.aleo.
 */
export interface ICreditService {
  /**
   * Collect credit metrics from local invoice and payment records.
   * All computation happens client-side; no data leaves the device.
   */
  collectMetrics(
    records: Invoice[],
    payments: PaymentReceipt[]
  ): CreditMetrics;

  /**
   * Query the on-chain credit_proofs mapping: proof_id => claim_hash.
   * Returns the deserialized CreditClaim if found, null otherwise.
   */
  getProofFromChain(proofId: AleoField): Promise<AleoField | null>;
}
