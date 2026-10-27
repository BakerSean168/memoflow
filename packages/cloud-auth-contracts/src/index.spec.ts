import { describe, expect, it } from 'vitest';
import {
  BetterAuthSessionResponseSchema,
  CloudAuthResponseSchema,
  DesktopCloudAttemptRequestSchema,
  DesktopCloudConnectionRequestSchema,
} from './index';

describe('cloud authentication wire contracts', () => {
  it('preserves account and nullable session responses', () => {
    const response = {
      account: {
        id: 'account',
        email: 'user@example.com',
        name: 'User',
        emailVerified: false,
      },
      session: null,
      requiresEmailVerification: true,
    };
    expect(CloudAuthResponseSchema.parse(response)).toEqual(response);
    expect(
      CloudAuthResponseSchema.safeParse({
        ...response,
        account: { id: 'account' },
      }).success,
    ).toBe(false);
  });

  it('requires a complete Better Auth session', () => {
    const response = {
      user: { id: 'account', email: 'user@example.com', name: 'User' },
      session: { id: 'session', expiresAt: '2026-10-28T00:00:00.000Z' },
    };
    expect(BetterAuthSessionResponseSchema.parse(response)).toEqual(response);
    expect(BetterAuthSessionResponseSchema.safeParse({ ...response, session: null }).success).toBe(
      false,
    );
  });

  it('keeps desktop connection requests strict and attempt identifiers validated', () => {
    expect(DesktopCloudConnectionRequestSchema.parse({ intent: 'add_account' })).toEqual({
      intent: 'add_account',
    });
    expect(
      DesktopCloudConnectionRequestSchema.safeParse({
        intent: 'add_account',
        profileId: 'foreign',
      }).success,
    ).toBe(false);
    expect(DesktopCloudAttemptRequestSchema.safeParse({ attemptId: 'invalid' }).success).toBe(
      false,
    );
    expect(
      DesktopCloudAttemptRequestSchema.parse({
        attemptId: '556ee251-311c-450d-a479-d9f802cc1e60',
      }),
    ).toEqual({ attemptId: '556ee251-311c-450d-a479-d9f802cc1e60' });
  });
});
