'use client';

import { useEffect } from 'react';
import { useErrorStore } from '@/stores/Error/useErrorStore';
import { toast } from 'sonner';

/**
 * Global error handling component
 *
 * Responsibilities:
 * 1. Listen for error states in the ErrorStore
 * 2. Automatically display errors using the toast component
 * 3. Follows architectural principles: as a View layer component, reads state from the Store
 */
export function ErrorHandler() {
  const { currentError, clearError } = useErrorStore();

  useEffect(() => {
    if (currentError) {
      // Display error using sonner toast
      toast.error(currentError.title, {
        description: currentError.description,
        duration: 5000,
        action: {
          label: 'Close',
          onClick: () => clearError()
        }
      });

      // Automatically clear error (to avoid repeated display)
      const timer = setTimeout(() => {
        clearError();
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [currentError, clearError]);

  // This component does not render any UI; it only handles error processing logic
  return null;
}

