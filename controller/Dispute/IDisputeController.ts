import type {
  AleoTransactionId,
  RaiseDisputeParams,
  ResolveDisputeParams,
  SubmitEvidenceParams,
} from '@/lib/types';

export interface IDisputeController {
  isProcessing: boolean;
  currentLog: string;

  executeRaiseDispute(params: RaiseDisputeParams): Promise<AleoTransactionId>;
  executeResolveDispute(params: ResolveDisputeParams): Promise<AleoTransactionId>;
  executeSubmitEvidence(params: SubmitEvidenceParams): Promise<AleoTransactionId>;
}
