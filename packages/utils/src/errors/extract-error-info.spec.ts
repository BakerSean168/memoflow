import { describe, expect, it } from 'vitest';
import { ResultErrorException } from '@memoflow/transport-contracts/result';
import { extractErrorInfo } from './extract-error-info';

describe('extractErrorInfo', () => {
  it('preserves structured code/status/context for a ResultErrorException', () => {
    const ex = new ResultErrorException(
      'task not found',
      'task_template_not_found',
      undefined,
      { templateId: 't-1' },
      400,
    );
    expect(extractErrorInfo(ex)).toEqual({
      code: 'task_template_not_found',
      message: 'task not found',
      httpStatus: 400,
      context: { templateId: 't-1' },
    });
  });

  it('returns UNKNOWN_ERROR for a plain Error', () => {
    expect(extractErrorInfo(new Error('boom'))).toEqual({
      code: 'UNKNOWN_ERROR',
      message: 'boom',
      httpStatus: 500,
    });
  });

  it('returns UNKNOWN_ERROR for non-error values', () => {
    expect(extractErrorInfo('nope')).toEqual({
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred',
      httpStatus: 500,
    });
  });
});
