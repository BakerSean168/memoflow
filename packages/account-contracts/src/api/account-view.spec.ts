import { describe, expect, it } from 'vitest';
import { AccountViewSchema, CloudIdentitySummarySchema } from './response-schemas';

const account = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  status: 'Active',
  profile: {
    nickname: 'Memo',
    realName: null,
    avatarUrl: null,
    bio: null,
    gender: 'PreferNotToSay',
    birthday: null,
  },
  createdAt: 1,
  updatedAt: 2,
  closedAt: null,
} as const;

describe('ACC-1402 AccountView + CloudIdentitySummary contract', () => {
  it('keeps auth identity separate from the product Account payload', () => {
    expect(
      AccountViewSchema.parse({
        account,
        cloudIdentity: {
          identityId: '123e4567-e89b-12d3-a456-426614174000',
          email: 'login@example.com',
          emailVerified: true,
        },
      }),
    ).toMatchObject({
      account: { id: '123e4567-e89b-12d3-a456-426614174000' },
      cloudIdentity: { email: 'login@example.com', emailVerified: true },
    });
  });

  it('allows local-only Account views without a cloud identity', () => {
    expect(AccountViewSchema.parse({ account, cloudIdentity: null }).cloudIdentity).toBeNull();
  });

  it.each(['sessionId', 'token', 'accessToken', 'refreshToken', 'provider', 'providerAccountId'])(
    'strips forbidden auth capability field %s from CloudIdentitySummary',
    (field) => {
      const parsed = CloudIdentitySummarySchema.parse({
        identityId: '123e4567-e89b-12d3-a456-426614174000',
        email: 'login@example.com',
        emailVerified: true,
        [field]: 'secret',
      });
      expect(parsed).not.toHaveProperty(field);
    },
  );

  it('rejects malformed login identity data at the composition boundary', () => {
    expect(
      CloudIdentitySummarySchema.safeParse({
        identityId: '123e4567-e89b-12d3-a456-426614174000',
        email: 'not-an-email',
        emailVerified: true,
      }).success,
    ).toBe(false);
  });
});
