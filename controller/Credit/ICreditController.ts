import type {
  CreditMetrics,
  CreditClaim,
  CreditProofToken,
  CreditVerifyResult,
} from '@/lib/types';

export interface ICreditController {
  metrics: CreditMetrics | null;
  isProcessing: boolean;
  currentLog: string;

  collectLocalMetrics(): Promise<void>;
  generateProof(claim: CreditClaim): Promise<CreditProofToken>;
  verifyProof(proofId: string): Promise<CreditVerifyResult>;
}
