import { createHash } from 'node:crypto';

/**
 * Namespace for the deterministic invocation-attempt identity.
 *
 * `invocation_attempts` is keyed by `(invocationId, attemptNumber)` at the
 * database level, so that pair — not the writing host — is the logical identity
 * of one attempt. Deriving the primary key from it makes every writer (API
 * Prisma lane, Desktop PowerSync lane) produce the same row identity, which is
 * what lets a duplicate concurrent write converge instead of colliding with
 * the natural unique key on upload.
 *
 * The version segment is part of the namespace: changing the derivation rule
 * means publishing a new version, never rewriting stored rows.
 */
const INVOCATION_ATTEMPT_ID_NAMESPACE = 'memoflow:invocation-attempt:v1';

/**
 * Stable attempt id for one `(invocationId, attemptNumber)` pair.
 *
 * Mirrors the repository's existing deterministic id style for
 * `scheduled_invocations` (sha256 over a versioned namespace) rather than
 * introducing a second derivation scheme.
 */
export function deriveInvocationAttemptId(invocationId: string, attemptNumber: number): string {
  if (typeof invocationId !== 'string' || invocationId.length === 0) {
    throw new TypeError('invocationId must be a non-empty string.');
  }
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) {
    throw new TypeError('attemptNumber must be a positive safe integer.');
  }
  const digest = createHash('sha256')
    .update(`${INVOCATION_ATTEMPT_ID_NAMESPACE}\u0000`)
    .update(invocationId)
    .update('\u0000')
    .update(String(attemptNumber))
    .digest('hex');
  return `invocation-attempt:${digest}`;
}

export { INVOCATION_ATTEMPT_ID_NAMESPACE };
