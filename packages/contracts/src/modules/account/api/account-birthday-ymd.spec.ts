import { describe, expect, it } from 'vitest';
import { createMockAccount } from '../../../mocks/account.mock';
import { requireYmd } from '../../../primitives';
import { AccountResponseSchema } from './response-schemas';

describe('Account birthday Ymd wire contract (TIME-1206)', () => {
  it('accepts canonical Ymd and null birthdays', () => {
    const account = createMockAccount();
    expect(
      AccountResponseSchema.safeParse({
        ...account,
        profile: { ...account.profile, birthday: requireYmd('2000-02-29') },
      }).success,
    ).toBe(true);
    expect(AccountResponseSchema.safeParse(account).success).toBe(true);
  });

  it('rejects legacy epoch-ms and impossible date birthdays', () => {
    const account = createMockAccount();
    for (const birthday of [Date.parse('2000-01-01T00:00:00.000Z'), '2001-02-29']) {
      expect(
        AccountResponseSchema.safeParse({
          ...account,
          profile: { ...account.profile, birthday },
        }).success,
      ).toBe(false);
    }
  });
});
