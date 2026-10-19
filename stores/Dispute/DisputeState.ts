import type { DisputeRecord, AleoField } from '@/lib/types';

export interface DisputeState {
  disputes: DisputeRecord[];
  isLoading: boolean;

  addDispute(dispute: DisputeRecord): void;
  updateDispute(disputeId: AleoField, data: Partial<DisputeRecord>): void;
  removeDispute(disputeId: AleoField): void;
}
