import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdentityId } from '../identity-id';

describe('IdentityId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates ids that satisfy the shared id guard', () => {
    const value = IdentityId.generate();

    expect(IdentityId.is(value)).toBe(true);
    expect(IdentityId.of(value)).toBe(value);
  });

  it('warns when accepting a legacy non-prefixed value', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(IdentityId.of('IdentityId_legacy')).toBe('IdentityId_legacy');
    expect(warnSpy).toHaveBeenCalled();
  });
});
