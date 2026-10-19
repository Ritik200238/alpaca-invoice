import { useCallback } from 'react';
import { useErrorStore } from '@/stores/Error/useErrorStore';
import { toAppError } from '@/lib/errors';

/**
 * Error Handler Controller
 *
 * Responsibilities:
 * 1. Provide a unified error handling interface
 * 2. Convert raw errors to user-friendly messages
 * 3. Update ErrorStore
 */
export function useErrorHandler() {
  const { showError } = useErrorStore();

  /**
   * Handle error
   * Automatically converts any error to AppError and displays it
   */
  const handleError = useCallback((error: any) => {
    const appError = toAppError(error);

    // Log to console (convenient for debugging during development)
    console.error('❌ Error caught:', {
      type: appError.type,
      title: appError.title,
      description: appError.description,
      original: appError.originalError
    });

    // Update Store, trigger Toast display
    showError(appError.title, appError.description);
  }, [showError]);

  return {
    handleError
  };
}

