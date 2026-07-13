"use client";

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Whether to also show a toast notification (default: true) */
  showToast?: boolean;
}

export interface ErrorHandlerState {
  /** Current error, if any */
  error: Error | null;
  /** Whether an error is present */
  isError: boolean;
  /** Whether a retry is in progress */
  isRetrying: boolean;
  /** Number of retry attempts made so far */
  retryCount: number;
}

export interface UseErrorHandlerReturn extends ErrorHandlerState {
  /** Call when an error occurs */
  handleError: (err: unknown, context?: string) => void;
  /** Call to retry the last failed operation */
  retry: () => Promise<void>;
  /** Clear the current error */
  clearError: () => void;
  /** Register a retryable action */
  onRetryable: (fn: () => Promise<void>) => void;
}

/**
 * Hook for managing error state with retry support.
 * Shows both a card-compatible error state and optional toast notifications.
 *
 * @example
 * ```tsx
 * const { error, isRetrying, handleError, retry, clearError, onRetryable } = useErrorHandler();
 *
 * // Register the action that can be retried
 * onRetryable(async () => {
 *   await sendMessage({ text });
 * });
 *
 * // Wrap risky operations
 * try {
 *   await doSomething();
 * } catch (err) {
 *   handleError(err, "Failed to do something");
 * }
 * ```
 */
export function useErrorHandler(
  config: RetryConfig = {},
): UseErrorHandlerReturn {
  const { maxRetries = 3, showToast = true } = config;

  const [error, setError] = useState<Error | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const retryableFn = useRef<(() => Promise<void>) | null>(null);
  const lastContext = useRef<string | undefined>(undefined);

  const clearError = useCallback(() => {
    setError(null);
    setRetryCount(0);
    setIsRetrying(false);
  }, []);

  const handleError = useCallback(
    (err: unknown, context?: string) => {
      const errorObj =
        err instanceof Error
          ? err
          : new Error(typeof err === "string" ? err : "An unexpected error occurred");

      setError(errorObj);
      lastContext.current = context;

      if (showToast) {
        const title = context ?? "Error";
        toast.error(title, {
          description: errorObj.message,
          duration: 5000,
        });
      }
    },
    [showToast],
  );

  const onRetryable = useCallback((fn: () => Promise<void>) => {
    retryableFn.current = fn;
  }, []);

  const retry = useCallback(async () => {
    const fn = retryableFn.current;
    if (!fn) return;

    if (retryCount >= maxRetries) {
      const msg = `Maximum retry attempts (${maxRetries}) reached`;
      toast.error(msg);
      return;
    }

    setIsRetrying(true);
    try {
      await fn();
      clearError();
    } catch (err) {
      setRetryCount((prev) => prev + 1);
      const errorObj =
        err instanceof Error
          ? err
          : new Error(typeof err === "string" ? err : "Retry failed");
      setError(errorObj);

      if (showToast) {
        toast.error(lastContext.current ?? "Retry failed", {
          description: errorObj.message,
          duration: 5000,
        });
      }
    } finally {
      setIsRetrying(false);
    }
  }, [retryCount, maxRetries, showToast, clearError]);

  return {
    error,
    isError: error !== null,
    isRetrying,
    retryCount,
    handleError,
    retry,
    clearError,
    onRetryable,
  };
}
