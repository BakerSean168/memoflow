import type { FailureRetryHint } from './public-failure';

/** Backoff policy owned by an operation or executor. */
export type BackoffPolicy =
  | { readonly kind: 'none' }
  | { readonly kind: 'fixed'; readonly delayMs: number }
  | {
      readonly kind: 'exponential';
      readonly baseDelayMs: number;
      readonly maxDelayMs: number;
    };

/** Retry mode owned by an operation or executor. */
export type OperationRetryMode =
  'never' | 'safe_read' | 'idempotent_write' | 'transaction' | 'workflow_step';

/**
 * Operation-level automatic retry policy.
 *
 * A failure retry hint never authorizes a retry by itself. The operation policy,
 * idempotency state, cancellation state, and attempt budget must also permit it.
 */
export interface OperationRetryPolicy {
  readonly mode: OperationRetryMode;
  readonly maxAttempts: number;
  readonly requiresIdempotencyKey: boolean;
  readonly backoff: BackoffPolicy;
}

/** Presentation/application recovery action, separate from automatic retry policy. */
export type RecoveryAction =
  | { readonly kind: 'none' }
  | { readonly kind: 'reauthenticate' }
  | { readonly kind: 'verify_email'; readonly email: string }
  | { readonly kind: 'correct_input'; readonly fields?: readonly string[] }
  | { readonly kind: 'resolve_conflict'; readonly resource: string }
  | { readonly kind: 'retry_manually' };

/** Result of evaluating automatic retry eligibility. */
export type RetryDecision =
  | { readonly retry: false; readonly reason: string }
  | { readonly retry: true; readonly delayMs: number };

/** Calculate deterministic operation backoff for the next attempt. */
export function operationBackoffDelay(policy: BackoffPolicy, attempt: number): number {
  switch (policy.kind) {
    case 'none':
      return 0;
    case 'fixed':
      return Math.max(0, policy.delayMs);
    case 'exponential': {
      const exponent = Math.max(0, attempt - 1);
      return Math.min(
        Math.max(0, policy.maxDelayMs),
        Math.max(0, policy.baseDelayMs) * 2 ** exponent,
      );
    }
  }
}

/**
 * Evaluate failure hint, operation policy, idempotency, budget, and cancellation.
 */
export function decideOperationRetry(input: {
  readonly hint: FailureRetryHint | undefined;
  readonly policy: OperationRetryPolicy;
  readonly attempt: number;
  readonly hasIdempotencyKey: boolean;
  readonly canceled?: boolean;
}): RetryDecision {
  if (input.canceled) {
    return { retry: false, reason: 'canceled' };
  }
  if (!input.hint || input.hint.kind === 'not_retryable') {
    return { retry: false, reason: 'failure_not_retryable' };
  }
  if (input.policy.mode === 'never') {
    return { retry: false, reason: 'operation_retry_disabled' };
  }
  if (input.policy.maxAttempts <= 0 || input.attempt >= input.policy.maxAttempts) {
    return { retry: false, reason: 'attempt_budget_exhausted' };
  }
  if (input.policy.requiresIdempotencyKey && !input.hasIdempotencyKey) {
    return { retry: false, reason: 'idempotency_key_required' };
  }

  const policyDelay = operationBackoffDelay(input.policy.backoff, input.attempt + 1);
  const failureDelay = input.hint.kind === 'after' ? input.hint.afterMs : 0;
  return { retry: true, delayMs: Math.max(policyDelay, failureDelay) };
}
