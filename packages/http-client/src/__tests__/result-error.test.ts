import { describe, expect, it, vi } from 'vitest';
import {
  EmptyFailureDetailsSchema,
  FailureCategories,
  createPublicFailure,
  defineFailureRegistry,
  strictFailureDetails,
  toLegacyResultError,
} from '@memoflow/transport-contracts/result';
import { z } from 'zod';
import { normalizeResultError, translateResultErrorMessage } from '../result-error';

const AuthFailureRegistry = defineFailureRegistry({
  AUTH_INVALID_CREDENTIALS: {
    category: FailureCategories.Unauthenticated,
    details: EmptyFailureDetailsSchema,
    retryHint: { kind: 'not_retryable' },
    telemetry: 'invalid_credentials',
  },
  AUTH_RATE_LIMITED: {
    category: FailureCategories.RateLimited,
    details: strictFailureDetails({ retryAfterMs: z.number().int().nonnegative() }),
    retryHint: { kind: 'transient' },
    telemetry: 'rate_limited',
  },
});

describe('typed Result error compatibility', () => {
  it('preserves a valid public failure and treats its code as canonical', () => {
    const failure = createPublicFailure(AuthFailureRegistry, 'AUTH_INVALID_CREDENTIALS', {});
    const normalized = normalizeResultError({
      ...toLegacyResultError(failure, 'Safe fallback'),
      code: 'UNAUTHORIZED',
    });

    expect(normalized).toEqual({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Safe fallback',
      details: undefined,
      context: undefined,
      failure,
      cause: undefined,
    });
  });

  it('uses typed failure details as i18n parameters', () => {
    const failure = createPublicFailure(AuthFailureRegistry, 'AUTH_RATE_LIMITED', {
      retryAfterMs: 5_000,
    });
    const t = vi.fn((key: string, params?: Record<string, unknown>) => {
      if (key === 'auth.errors.AUTH_RATE_LIMITED') {
        return `Retry after ${String(params?.retryAfterMs)}`;
      }
      return key;
    });

    expect(
      translateResultErrorMessage(toLegacyResultError(failure, 'Fallback'), t, {
        scope: 'auth',
      }),
    ).toBe('Retry after 5000');
    expect(t).toHaveBeenCalledWith('auth.errors.AUTH_RATE_LIMITED', {
      retryAfterMs: 5_000,
    });
  });

  it('drops structurally unsafe public failure data', () => {
    const normalized = normalizeResultError({
      code: 'INTERNAL_ERROR',
      message: 'Safe fallback',
      failure: {
        code: 'AUTH_INTERNAL',
        category: 'internal',
        details: {},
        providerBody: { token: 'secret' },
      },
    });

    expect(normalized?.failure).toBeUndefined();
    expect(normalized?.code).toBe('INTERNAL_ERROR');
  });

  it('keeps the legacy safe-message fallback until presentation migration completes', () => {
    const t = vi.fn((key: string) => key);
    expect(
      translateResultErrorMessage({ code: 'LEGACY_UNKNOWN', message: 'MemoFlow safe fallback' }, t),
    ).toBe('MemoFlow safe fallback');
  });
});
