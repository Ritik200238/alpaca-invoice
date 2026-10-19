import { createServiceError } from '@/lib/service-errors';
import type { AleoField, EscrowRecord } from '@/lib/types';

export enum EscrowError {
  NOT_ESCROWED = 'NOT_ESCROWED',
  DELIVERY_NOT_EXPIRED = 'DELIVERY_NOT_EXPIRED',
  ALREADY_RELEASED = 'ALREADY_RELEASED',
  INSUFFICIENT_TOKEN = 'INSUFFICIENT_TOKEN'
}

export const EscrowServiceError = createServiceError<EscrowError>('EscrowService');
export type EscrowServiceError = InstanceType<typeof EscrowServiceError>;

/** On-chain escrow data assembled from public mappings */
export interface ChainEscrowData {
  escrowId: AleoField;
  invoiceId: AleoField;
  status: number;
  balance: bigint;
}

/**
 * Service for querying escrow-related on-chain mappings
 * from zk_invoice_v4.aleo.
 */
export interface IEscrowService {
  /** Look up escrow_registry mapping: invoice_id => escrow_id */
  getEscrowByInvoiceId(invoiceId: AleoField): Promise<AleoField | null>;

  /** Look up escrow_status mapping: escrow_id => status (u8) */
  getEscrowStatus(escrowId: AleoField): Promise<number | null>;

  /** Look up escrow_balances mapping: escrow_id => amount (u64) */
  getEscrowBalance(escrowId: AleoField): Promise<bigint | null>;

  /** Fetch all on-chain escrow data for an invoice in one call */
  getChainEscrowData(invoiceId: AleoField): Promise<ChainEscrowData | null>;

  /** Determine whether the delivery deadline has passed for an escrow. */
  isDeliveryExpired(escrowRecord: EscrowRecord): boolean;
}
