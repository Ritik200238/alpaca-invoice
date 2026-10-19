import { create } from 'zustand';
import { TransactionState } from './TransactionState';

/**
 * Transaction Store 实现
 * 管理交易执行过程中的状态和进度
 */
export const useTransactionStore = create<TransactionState>((set) => ({
  // 初始状态
  isProcessing: false,
  stage: 'IDLE',
  progress: 0,
  logs: [],

  // Actions
  startTx: (stage) => {
    set({
      isProcessing: true,
      stage,
      progress: 0,
      logs: [`开始 ${stage} 阶段...`]
    });
  },

  updateProgress: (progress, log) => {
    set((state) => ({
      progress,
      logs: log ? [...state.logs, log] : state.logs
    }));
  },

  completeTx: () => {
    set({
      isProcessing: false,
      stage: 'IDLE',
      progress: 100,
      logs: []
    });
  }
}));

