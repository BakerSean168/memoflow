/**
 * Residual 973 + 975 + 1055 + 1057 + 1059: sole createComposableHandleError factory for app-vue composables.
 * Residual 1059 remains part of the shared composable error seam.
 * Residual 973: schedule / notification / reminder / setting (default console.error report).
 * Residual 975: task instances / templates / dependencies (toast.error report via `report`).
 * Residual 1055: authentication useSession + account useAccount (toast.error report via `report`).
 * Residual 1057: governance useGovernance (default console.error report; setGovernanceError dual retired).
 * Local handleError duals retired in these clusters.
 * Soft residual: usePassword / account checkAvailability toast-only (no setError) keep-boundary.
 * Soft residual 1075: password/checkAvailability toast-only keep-boundary surface (no force-merge).
 * Soft residual 1065: goal createGoalErrorHandler rich-log keep-boundary (scope/details ≠ sole).
 */

import type { ResultErrorTranslateFn } from '@memoflow/http-client';
import { translateResultError } from './translate-result-error';

export interface ComposableHandleErrorOptions {
  t: ResultErrorTranslateFn;
  setError: (message: string | null) => void;
  /** Defaults to console.error(message). Toast/other reporters pass custom handlers. */
  report?: (message: string) => void;
}

/**
 * Build a composable-local handleError(error, fallbackKey) that translates Result errors,
 * writes store error state, and reports the message.
 */
export function createComposableHandleError(
  options: ComposableHandleErrorOptions,
): (error: unknown, fallbackKey: string) => void {
  const report = options.report ?? ((message: string) => {
    console.error(message);
  });

  return function handleError(error: unknown, fallbackKey: string): void {
    const message = translateResultError(error, options.t, { fallbackKey });
    options.setError(message);
    report(message);
  };
}
