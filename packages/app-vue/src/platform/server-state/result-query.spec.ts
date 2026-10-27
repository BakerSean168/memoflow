import { describe, expect, it } from 'vitest';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { resultQueryFn } from './result-query';

describe('resultQueryFn (plan §3.4)', () => {
  it('returns data on ok', async () => {
    const fn = resultQueryFn(async () => ok({ value: 42 }));
    await expect(fn()).resolves.toEqual({ value: 42 });
  });

  it('throws a typed ResultErrorException carrying the original code/message on fail', async () => {
    const fn = resultQueryFn(async () =>
      fail({
        code: 'VALIDATION_ERROR',
        message: 'Cannot load',
        details: [{ field: 'x', code: 'E', message: 'm' }],
      }),
    );

    const error = await fn().then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as { code?: string }).code).toBe('VALIDATION_ERROR');
    expect((error as Error).message).toBe('Cannot load');
  });

  it('passes transport Result contract through unchanged on the success path', async () => {
    const fn = resultQueryFn(async () => ok([1, 2, 3]));
    await expect(fn()).resolves.toEqual([1, 2, 3]);
  });
});
