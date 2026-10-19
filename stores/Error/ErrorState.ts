/**
 * 错误状态定义
 */
export interface ErrorState {
  // 当前错误
  currentError: {
    id: string;
    title: string;
    description?: string;
    timestamp: number;
  } | null;
  
  // 错误历史
  errorHistory: Array<{
    id: string;
    title: string;
    description?: string;
    timestamp: number;
  }>;
}

export interface ErrorActions {
  // 显示错误
  showError: (title: string, description?: string) => void;
  
  // 清除当前错误
  clearError: () => void;
  
  // 清除所有历史
  clearHistory: () => void;
}

