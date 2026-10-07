import { describe, expect, it } from 'vitest';
import { IsAccountActiveUseCase } from '../is-account-active.use-case';

describe('Account credential authority', () => {
  it.each([
    ['Active', false, true],
    ['Active', true, false],
    ['Closed', false, false],
    [null, false, false],
  ])('status %s and closing %s yields %s', async (status, closing, expected) => {
    const useCase = new IsAccountActiveUseCase({
      readStatus: async () => status,
      hasActiveClosure: async () => closing,
    });
    expect(await useCase.execute('identity-a')).toBe(expected);
  });
});
