import type { EscrowRecord, AleoField } from '@/lib/types';

export interface EscrowState {
  escrows: EscrowRecord[];
  isLoading: boolean;

  addEscrow(escrow: EscrowRecord): void;
  updateEscrow(escrowId: AleoField, data: Partial<EscrowRecord>): void;
}
