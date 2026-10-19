import { createServiceError } from '@/lib/service-errors';
import type { AleoField, DisputeRecord } from '@/lib/types';

export enum DisputeError {
  INVOICE_NOT_PENDING = 'INVOICE_NOT_PENDING',
  NOT_BUYER = 'NOT_BUYER',
  DISPUTE_EXPIRED = 'DISPUTE_EXPIRED',
  NOT_ARBITER = 'NOT_ARBITER',
  ALREADY_RESOLVED = 'ALREADY_RESOLVED'
}

export const DisputeServiceError = createServiceError<DisputeError>('DisputeService');
export type DisputeServiceError = InstanceType<typeof DisputeServiceError>;

/**
 * Service for querying dispute-related on-chain mappings
 * from zk_invoice_v4.aleo.
 */
export interface IDisputeService {
  /** Look up dispute_registry mapping: invoice_id => dispute_id */
  getDisputeByInvoiceId(invoiceId: AleoField): Promise<AleoField | null>;

  /** Look up dispute_status mapping: dispute_id => status (u8) */
  getDisputeStatus(disputeId: AleoField): Promise<number | null>;

  /** Look up dispute_resolution mapping: dispute_id => resolution_hash */
  getDisputeResolution(disputeId: AleoField): Promise<AleoField | null>;
}
