import { describe, expect, it } from 'vitest';
import { unwrapResultOrThrow } from './result-client-error';

describe('unwrapResultOrThrow', () => {
  it('throws a structured client error while preserving result metadata', () => {
    expect(() =>
      unwrapResultOrThrow({
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权，请登录',
          details: [{ code: 'TOKEN_MISSING', message: 'missing token' }],
        },
      }),
    ).toThrowError(
      expect.objectContaining({
        name: 'ResultErrorException',
        code: 'UNAUTHORIZED',
        message: '未授权，请登录',
        details: [{ code: 'TOKEN_MISSING', message: 'missing token' }],
      }),
    );
  });
});
