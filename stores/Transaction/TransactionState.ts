export interface TransactionState {
  isProcessing: boolean;
  stage: 'IDLE' | 'HASHING' | 'REQUESTING' | 'ARCHIVING';
  progress: number;                 // 0-100
  logs: string[];                   // 实时日志流
  
  // Actions
  startTx: (stage: TransactionState['stage']) => void;
  updateProgress: (progress: number, log?: string) => void;
  completeTx: () => void;
}