import { describe, expect, it } from 'vitest';
import {
  EmptyFailureDetailsSchema,
  FailureCategories,
  createPublicFailure,
  defineFailureRegistry,
  toLegacyResultError,
} from '@memoflow/contracts/result';
import { presentErrorMessage } from '../result-error';

const TestFailureRegistry = defineFailureRegistry({
  NOT_FOUND: {
    category: FailureCategories.NotFound,
    details: EmptyFailureDetailsSchema,
    retryHint: { kind: 'not_retryable' },
    telemetry: 'test_not_found',
  },
});

describe('presentErrorMessage', () => {
  it('maps a result.error FORBIDDEN code to the stable message, never the raw', () => {
    expect(presentErrorMessage({ code: 'FORBIDDEN', message: 'Provider leaked: nope' })).toBe(
      '拒绝访问',
    );
  });

  it('maps a result.error SERVICE_UNAVAILABLE code to the stable message', () => {
    expect(presentErrorMessage({ code: 'SERVICE_UNAVAILABLE' })).toBe('服务不可用');
  });

  it('maps an unknown code to the UNKNOWN fallback', () => {
    expect(presentErrorMessage({ code: 'MYSTERY_CODE', message: 'raw' })).toBe('操作失败');
  });

  it('maps an INTERNAL_ERROR code to the stable message, never the raw', () => {
    expect(presentErrorMessage({ code: 'INTERNAL_ERROR', message: 'stack trace raw' })).toBe(
      '服务器内部错误',
    );
  });

  it('returns the UNKNOWN fallback for non-error / non-object input', () => {
    expect(presentErrorMessage(null)).toBe('操作失败');
    expect(presentErrorMessage(undefined)).toBe('操作失败');
    expect(presentErrorMessage('oops')).toBe('操作失败');
    expect(presentErrorMessage(42)).toBe('操作失败');
  });

  it('honors a provided fallbackMessage when the code is unknown', () => {
    expect(presentErrorMessage({ code: 'MYSTERY_CODE' }, '自定义提示')).toBe('自定义提示');
  });

  it('resolves legacy alias codes to their canonical message (USER_ALREADY_EXISTS → CONFLICT)', () => {
    expect(
      presentErrorMessage({ code: 'USER_ALREADY_EXISTS', message: 'Provider raw duplicate text' }),
    ).toBe('资源冲突');
    expect(presentErrorMessage({ code: 'ENTITY_NOT_FOUND', message: 'raw' })).toBe('资源不存在');
    expect(presentErrorMessage({ code: 'AUTH_REQUIRED', message: 'raw' })).toBe('未授权，请登录');
  });

  it('resolves a PublicFailure-shaped error by its code', () => {
    const failure = createPublicFailure(TestFailureRegistry, 'NOT_FOUND', {});
    const resultError = toLegacyResultError(failure, 'Provider raw message');
    expect(presentErrorMessage(resultError)).toBe('资源不存在');
  });
});
