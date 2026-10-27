/**
 * Shared failure reporting for the active Better Auth login/register operations.
 */
import { toast } from 'vue-sonner';
import type { ResultError, ResultMeta } from '@memoflow/contracts/result';
import type { PasswordMutationErrorReceipt } from '../stores/authentication-store';
import type { AuthContext } from './useAuthContext';

type AuthFailureDeps = Pick<
  AuthContext,
  'store' | 't' | 'lastResultError' | 'getLocalizedAuthError'
>;

/** Report a failed Result (result.ok === false) and return false. */
export function reportAuthResultFailure(
  deps: AuthFailureDeps,
  error: ResultError,
  toastKey: string,
): false {
  deps.lastResultError.value = error;
  const message = deps.getLocalizedAuthError(error, 'auth.errors.UNKNOWN');
  deps.store.setError(message);
  toast.error(deps.t(toastKey), { description: message });
  return false;
}

/** Report a thrown error in an auth operation catch block and return false. */
export function reportAuthCatchFailure(
  deps: AuthFailureDeps,
  error: unknown,
  logLabel: string,
  toastKey: string,
): false {
  deps.store.setLoading(false);
  console.error(`[auth] ${logLabel} failed`, error);
  const description = deps.getLocalizedAuthError(error, 'auth.errors.UNKNOWN');
  deps.lastResultError.value = {
    code: 'UNKNOWN',
    message: description,
  };
  deps.store.setError(description);
  toast.error(deps.t(toastKey), { description });
  return false;
}

// ─── Password mutation structured error receipt (W6-C) ──────────────────────

const NON_RETRYABLE_CODES = new Set([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'CONFLICT',
  'NOT_FOUND',
]);

/** Password mutations are retryable unless the code means retrying cannot help. */
export function isPasswordErrorRetryable(code: string): boolean {
  return !NON_RETRYABLE_CODES.has(code);
}

/**
 * Allowlist of error codes whose localized message is safe to persist. Only
 * these codes (and the generic UNKNOWN fallback) may ever be written into the
 * durable receipt — never an arbitrary server-provided message/context.
 */
export const SAFE_PASSWORD_MUTATION_ERROR_CODES = new Set([
  'BAD_REQUEST',
  'CONFLICT',
  'FORBIDDEN',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
  'TIMEOUT',
  'UNKNOWN',
  'EMAIL_VERIFICATION_REQUIRED',
  'USER_ALREADY_EXISTS',
]);

/**
 * Resolve an allowlisted, localized safe message for an auth Result failure.
 * Never returns the raw server message or context, so credentials or tokens
 * echoed by the server can never reach the persisted receipt.
 */
export function getSafePasswordMutationMessage(
  t: (key: string, params?: Record<string, unknown>) => string,
  error: ResultError,
): string {
  const code = typeof error.code === 'string' ? error.code : 'UNKNOWN';
  const key = SAFE_PASSWORD_MUTATION_ERROR_CODES.has(code)
    ? `auth.errors.${code}`
    : 'auth.errors.UNKNOWN';
  return t(key);
}

/**
 * Build a structured password mutation error receipt from a Result failure.
 * The persisted message is always resolved through the allowlist of localized
 * safe texts — the raw server `message`/`context` is never stored, so submitted
 * passwords, reset tokens or email params cannot leak into store/localStorage.
 */
export function buildPasswordMutationErrorReceipt(
  error: ResultError,
  meta: ResultMeta | undefined,
  operation: PasswordMutationErrorReceipt['operation'],
  t: (key: string, params?: Record<string, unknown>) => string,
): PasswordMutationErrorReceipt {
  const requestId =
    meta?.traceId ??
    (typeof error.context?.requestId === 'string' ? error.context.requestId : null);
  return {
    code: typeof error.code === 'string' ? error.code : 'UNKNOWN',
    message: getSafePasswordMutationMessage(t, error),
    requestId,
    retryable: isPasswordErrorRetryable(typeof error.code === 'string' ? error.code : 'UNKNOWN'),
    operation,
    failedAt: Date.now(),
  };
}
