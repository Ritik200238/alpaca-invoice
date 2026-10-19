import { create } from 'zustand';
import { ErrorState, ErrorActions } from './ErrorState';

export const useErrorStore = create<ErrorState & ErrorActions>((set) => ({
  // 初始状态
  currentError: null,
  errorHistory: [],

  // 显示错误
  showError: (title: string, description?: string) => {
    const error = {
      id: `error-${Date.now()}-${Math.random()}`,
      title,
      description,
      timestamp: Date.now()
    };
    
    set((state) => ({
      currentError: error,
      errorHistory: [error, ...state.errorHistory].slice(0, 50) // 保留最近 50 条
    }));
  },

  // 清除当前错误
  clearError: () => {
    set({ currentError: null });
  },

  // 清除历史
  clearHistory: () => {
    set({ errorHistory: [] });
  }
}));

