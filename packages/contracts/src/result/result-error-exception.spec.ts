import { describe, expect, it } from 'vitest';
import { extractStructuredResultError, unwrapOrThrowError, ResultErrorException } from './index';

describe('ResultErrorException', () => {
  it('preserves structured error metadata when unwrapping a failure result', () => {
    expect(() =>
      unwrapOrThrowError({
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '未授权，请登录',
          details: [{ code: 'TOKEN_MISSING', message: 'missing token' }],
          context: { source: 'test' },
        },
      }),
    ).toThrowError(
      expect.objectContaining({
        name: 'ResultErrorException',
        code: 'UNAUTHORIZED',
        message: '未授权，请登录',
        details: [{ code: 'TOKEN_MISSING', message: 'missing token' }],
        context: { source: 'test' },
      }),
    );
  });

  it('extracts structured metadata from ResultErrorException', () => {
    const extracted = extractStructuredResultError(
      new ResultErrorException(
        'Access denied',
        'FORBIDDEN',
        [{ code: 'MISSING_ROLE', message: 'admin required' }],
        { source: 'spec' },
        403,
      ),
    );

    expect(extracted).toEqual({
      code: 'FORBIDDEN',
      message: 'Access denied',
      details: [{ code: 'MISSING_ROLE', message: 'admin required' }],
      context: { source: 'spec' },
      failure: undefined,
      cause: undefined,
      statusCode: 403,
    });
  });

  it('accepts plain structured failures but not arrays', () => {
    expect(extractStructuredResultError([])).toBeNull();
    expect(extractStructuredResultError({ code: 'X', message: 'y', statusCode: 400 })).toMatchObject({
      code: 'X', message: 'y', statusCode: 400,
    });
  });

  it('does not treat arbitrary node-style errors as structured result errors', () => {
    const error = new Error('missing file') as Error & { code: string };
    error.code = 'ENOENT';

    expect(extractStructuredResultError(error)).toBeNull();
  });
});
