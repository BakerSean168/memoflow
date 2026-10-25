import type { ResultError } from './core';
import type { PublicFailure } from './public-failure';

/**
 * Convert a typed public failure to the legacy ResultError envelope during migration.
 *
 * The safe message is presentation-neutral fallback text owned by MemoFlow, never a
 * provider exception message. The typed failure remains available as `error.failure`.
 */
export function toLegacyResultError(failure: PublicFailure, safeMessage: string): ResultError {
  return {
    code: failure.code,
    message: safeMessage,
    failure,
  };
}

/** Return the typed public failure attached to a legacy ResultError, if present. */
export function getPublicFailure(error: ResultError): PublicFailure | null {
  return error.failure ?? null;
}
