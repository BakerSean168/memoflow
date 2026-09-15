import { describe, expect, it } from 'vitest';
import { getProductTime } from '../../../shared/utils/product-time';
import { getUserTimezone } from './user-timezone';

describe('getUserTimezone', () => {
  it('reads the current Product Time context without Account/UserSetting fallback', () => {
    expect(getUserTimezone()).toBe(getProductTime().context.timeZone);
  });
});
