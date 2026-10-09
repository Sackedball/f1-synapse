import { toast } from 'sonner';

/**
 * Toast notification helpers for F1 Synapse
 * Consistent with design system dark palette
 */
export const showErrorToast = (message: string, details?: string) => {
  toast.error(message, {
    description: details,
    duration: 5000,
  });
};

export const showSuccessToast = (message: string, details?: string) => {
  toast.success(message, {
    description: details,
    duration: 3000,
  });
};

export const showInfoToast = (message: string, details?: string) => {
  toast.info(message, {
    description: details,
    duration: 3000,
  });
};

export const showToast = (message: string, details?: string) => {
  toast(message, {
    description: details,
    duration: 3000,
  });
};
