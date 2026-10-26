import { goalUiHost } from '../goal-ui-host';
/**
 * Goal Operations — reusable service-call + store-update patterns
 *
 * Encapsulates the repetitive orchestration of:
 *   1. Call service method
 *   2. On success → update store
 *   3. On failure → translate error + set store error
 *
 * Residual 1065 keep-boundary: createGoalErrorHandler is intentionally not
 * createComposableHandleError. Goal path needs rich structured console logging
 * (scope + ResultError details/context) and executeGoalOperation orchestration
 * with optional onError hook — shape mismatch vs shared handleError sole.
 *
 * @module goal/composables/goalOperations
 */

import type { Result, ResultError } from '@memoflow/transport-contracts';

import { toast } from 'vue-sonner';

type TranslateFn = (key: string) => string;
type ErrorHandler = (error: unknown, fallbackKey: string, scope?: string) => void;

/**
 * Execute an async operation that returns Result<T>, with automatic
 * error translation and logging. Returns the unwrapped data on success,
 * or null on failure.
 */
export async function executeGoalOperation<T>(
  operation: () => Promise<Result<T>>,
  options: {
    fallbackKey: string;
    scope: string;
    t: TranslateFn;
    setError: (message: string | null) => void;
    onError?: ErrorHandler;
  },
): Promise<T | null> {
  const { fallbackKey, scope, t, setError, onError } = options;
  try {
    const result = await operation();
    if (result.ok) {
      return result.data;
    }
    const message = goalUiHost.translateResultError(result.error, t, { fallbackKey });
    setError(message);
    onError?.(result.error, fallbackKey, scope);
    return null;
  } catch (e) {
    const message = goalUiHost.translateResultError(e, t, { fallbackKey });
    setError(message);
    onError?.(e, fallbackKey, scope);
    return null;
  }
}

/**
 * Execute an async operation that returns Result<T> and returns a boolean
 * indicating success. Suitable for delete/flag operations.
 */
export async function executeGoalAction(
  operation: () => Promise<Result<unknown>>,
  options: {
    fallbackKey: string;
    scope: string;
    t: TranslateFn;
    setError: (message: string | null) => void;
    onError?: ErrorHandler;
  },
): Promise<boolean> {
  const result = await executeGoalOperation(operation, options);
  return result !== null;
}

/**
 * Standard error handler for goal operations.
 * Translates the error, sets the store error, and logs with details.
 */
export function createGoalErrorHandler(
  t: TranslateFn,
  setError: (message: string | null) => void,
): ErrorHandler {
  return (error: unknown, fallbackKey: string, scope?: string) => {
    const message = goalUiHost.translateResultError(error, t, { fallbackKey });
    setError(message);
    toast.error(message);

    if (!error || typeof error !== 'object') {
      console.error(message);
      return;
    }

    const err = error as ResultError;
    const details = err.details?.map((detail) => ({
      field: detail.field,
      code: detail.code,
      message: detail.message,
      value: detail.value,
    }));

    console.error(`[goal] ${scope ?? 'error'}`, {
      code: err.code,
      message: err.message,
      details,
      context: err.context,
      translatedMessage: message,
    });
  };
}
