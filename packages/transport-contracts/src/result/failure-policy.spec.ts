import { describe, expect, it } from 'vitest';
import { decideOperationRetry, operationBackoffDelay } from './index';

describe('operation retry policy', () => {
  it('requires both a retryable failure and an operation policy', () => {
    expect(
      decideOperationRetry({
        hint: { kind: 'transient' },
        policy: {
          mode: 'never',
          maxAttempts: 3,
          requiresIdempotencyKey: false,
          backoff: { kind: 'none' },
        },
        attempt: 0,
        hasIdempotencyKey: false,
      }),
    ).toEqual({ retry: false, reason: 'operation_retry_disabled' });

    expect(
      decideOperationRetry({
        hint: { kind: 'not_retryable' },
        policy: {
          mode: 'safe_read',
          maxAttempts: 3,
          requiresIdempotencyKey: false,
          backoff: { kind: 'none' },
        },
        attempt: 0,
        hasIdempotencyKey: false,
      }),
    ).toEqual({ retry: false, reason: 'failure_not_retryable' });
  });

  it('does not retry idempotent writes without the required idempotency key', () => {
    expect(
      decideOperationRetry({
        hint: { kind: 'transient' },
        policy: {
          mode: 'idempotent_write',
          maxAttempts: 3,
          requiresIdempotencyKey: true,
          backoff: { kind: 'fixed', delayMs: 250 },
        },
        attempt: 0,
        hasIdempotencyKey: false,
      }),
    ).toEqual({ retry: false, reason: 'idempotency_key_required' });
  });

  it('honors cancellation and the attempt budget', () => {
    const policy = {
      mode: 'safe_read' as const,
      maxAttempts: 2,
      requiresIdempotencyKey: false,
      backoff: { kind: 'none' as const },
    };

    expect(
      decideOperationRetry({
        hint: { kind: 'transient' },
        policy,
        attempt: 0,
        hasIdempotencyKey: false,
        canceled: true,
      }),
    ).toEqual({ retry: false, reason: 'canceled' });

    expect(
      decideOperationRetry({
        hint: { kind: 'transient' },
        policy,
        attempt: 2,
        hasIdempotencyKey: false,
      }),
    ).toEqual({ retry: false, reason: 'attempt_budget_exhausted' });
  });

  it('uses the larger of provider retry-after and operation backoff', () => {
    expect(
      decideOperationRetry({
        hint: { kind: 'after', afterMs: 2_000 },
        policy: {
          mode: 'idempotent_write',
          maxAttempts: 4,
          requiresIdempotencyKey: true,
          backoff: { kind: 'exponential', baseDelayMs: 500, maxDelayMs: 10_000 },
        },
        attempt: 1,
        hasIdempotencyKey: true,
      }),
    ).toEqual({ retry: true, delayMs: 2_000 });

    expect(
      decideOperationRetry({
        hint: { kind: 'transient' },
        policy: {
          mode: 'safe_read',
          maxAttempts: 5,
          requiresIdempotencyKey: false,
          backoff: { kind: 'exponential', baseDelayMs: 500, maxDelayMs: 10_000 },
        },
        attempt: 3,
        hasIdempotencyKey: false,
      }),
    ).toEqual({ retry: true, delayMs: 4_000 });
  });

  it('calculates deterministic capped backoff', () => {
    expect(operationBackoffDelay({ kind: 'none' }, 3)).toBe(0);
    expect(operationBackoffDelay({ kind: 'fixed', delayMs: 250 }, 3)).toBe(250);
    expect(
      operationBackoffDelay({ kind: 'exponential', baseDelayMs: 1_000, maxDelayMs: 5_000 }, 4),
    ).toBe(5_000);
  });
});
