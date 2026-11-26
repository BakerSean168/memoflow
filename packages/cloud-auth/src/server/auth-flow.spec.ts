import * as argon2 from 'argon2';
import { memoryAdapter, type MemoryDB } from 'better-auth/adapters/memory';
import { createEmailVerificationToken } from 'better-auth/api';
import { describe, expect, it, vi } from 'vitest';
import { createCloudAuth } from './cloud-auth.js';

const BASE_URL = 'https://api.memo.test/api/auth';
const PASSWORD = 'Correct-password-123';
const SECRET = 'test-secret-with-at-least-thirty-two-characters';

type MemoryRow = Record<string, unknown> & { id: string };

function selectRow(row: MemoryRow | undefined, select?: Record<string, boolean>) {
  if (!row) return null;
  if (!select) return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => select[key]));
}

function createAuthFlowFixture() {
  const memory: MemoryDB = {
    cloudAuthUser: [],
    cloudAuthSession: [],
    cloudAuthProviderAccount: [],
    cloudAuthVerification: [],
    cloudAuthDeviceCode: [],
  };
  const sentEmails: Array<{ kind: string; email: string; url?: string; code?: string }> = [];
  const users = () => memory.cloudAuthUser as MemoryRow[];
  const sessions = () => memory.cloudAuthSession as MemoryRow[];
  const deviceCodes = () => memory.cloudAuthDeviceCode as MemoryRow[];
  const database = {
    cloudAuthUser: {
      findFirst: vi.fn(
        async ({
          where,
          select,
        }: {
          where: { email?: string };
          select?: Record<string, boolean>;
        }) =>
          selectRow(
            users().find((user) => user.email === where.email),
            select,
          ),
      ),
      findUnique: vi.fn(
        async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
          const user = users().find((candidate) => candidate.id === where.id);
          return user ? selectRow({ disabledAt: null, ...user }, select) : null;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const index = users().findIndex((user) => user.id === where.id);
        return index >= 0 ? users().splice(index, 1)[0] : null;
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    cloudAuthSession: {
      findFirst: vi.fn(
        async ({ where }: { where: { token: string } }) =>
          sessions().find((session) => session.token === where.token) ?? null,
      ),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    cloudAuthDeviceCode: {
      create: vi.fn(async ({ data }: { data: MemoryRow }) => {
        deviceCodes().push(data);
        return data;
      }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const auth = createCloudAuth(
    {
      database: database as never,
      secret: SECRET,
      baseUrl: BASE_URL,
      deviceVerificationUrl: 'https://app.memo.test/auth/device',
      trustedOrigins: ['https://app.memo.test'],
      userProvisioner: { provision: vi.fn() },
      emailDelivery: {
        send: vi.fn(async (email) => {
          sentEmails.push(email);
        }),
      },
    },
    {
      database: memoryAdapter(memory),
    },
  );

  const request = (path: string, init?: RequestInit) =>
    auth.handler(new Request(`${BASE_URL}${path}`, init));
  const post = (path: string, body: unknown) =>
    request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  return { auth, memory, sentEmails, request, post };
}

describe('email and password auth flow', () => {
  it.each([
    [{ email: 'not-an-email', password: PASSWORD, name: 'Person' }, 'VALIDATION_ERROR'],
    [{ password: PASSWORD, name: 'Person' }, 'VALIDATION_ERROR'],
    [{ email: 'person@example.com', name: 'Person' }, 'VALIDATION_ERROR'],
  ])('rejects an invalid sign-up payload %#', async (body, code) => {
    const fixture = createAuthFlowFixture();

    const response = await fixture.post('/sign-up/email', body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code });
  });

  it('preserves Better Auth native duplicate-email signup privacy behavior', async () => {
    const fixture = createAuthFlowFixture();
    const body = { email: 'person@example.com', password: PASSWORD, name: 'Person' };
    const now = new Date();
    (fixture.memory.cloudAuthUser as MemoryRow[]).push({
      id: 'existing-user',
      name: 'Existing Person',
      email: body.email,
      emailVerified: false,
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const duplicate = await fixture.post('/sign-up/email', body);

    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({ token: null });
  });

  it('issues an email-verification link after sign-up', async () => {
    const fixture = createAuthFlowFixture();

    const response = await fixture.post('/sign-up/email', {
      email: 'person@example.com',
      password: PASSWORD,
      name: 'Person',
    });

    expect(response.status).toBe(200);
    expect(fixture.sentEmails).toEqual([
      expect.objectContaining({
        kind: 'email-verification',
        email: 'person@example.com',
        url: expect.stringContaining(`${BASE_URL}/verify-email?token=`),
      }),
    ]);
  });

  it('returns INVALID_EMAIL_OR_PASSWORD for a non-existent email', async () => {
    const fixture = createAuthFlowFixture();

    const response = await fixture.post('/sign-in/email', {
      email: 'missing@example.com',
      password: PASSWORD,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_EMAIL_OR_PASSWORD' });
  });

  it('returns INVALID_EMAIL_OR_PASSWORD for a wrong password, not verification-required', async () => {
    const fixture = createAuthFlowFixture();
    const email = 'person@example.com';

    const signUp = await fixture.post('/sign-up/email', {
      email,
      password: PASSWORD,
      name: 'Person',
    });
    expect(signUp.status).toBe(200);
    await expect(signUp.json()).resolves.toMatchObject({ token: null });

    const wrongPassword = await fixture.post('/sign-in/email', {
      email,
      password: 'Wrong-password-123',
    });
    expect(wrongPassword.status).toBe(401);
    await expect(wrongPassword.json()).resolves.toMatchObject({
      code: 'INVALID_EMAIL_OR_PASSWORD',
    });
  });

  it('requires verification for the correct password while the email is unverified', async () => {
    const fixture = createAuthFlowFixture();
    const email = 'person@example.com';
    await fixture.post('/sign-up/email', {
      email,
      password: PASSWORD,
      name: 'Person',
    });

    const correctPassword = await fixture.post('/sign-in/email', {
      email,
      password: PASSWORD,
    });
    expect(correctPassword.status).toBe(403);
    const payload = (await correctPassword.json()) as Record<string, unknown>;
    expect(payload).toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
    });
    expect(payload).not.toHaveProperty('token');
  });

  it('signs in through Better Auth with a migrated legacy Argon2 credential', async () => {
    const fixture = createAuthFlowFixture();
    const now = new Date();
    const userId = 'legacy-user-1';
    const email = 'legacy@example.com';
    const passwordHash = await argon2.hash(PASSWORD);
    (fixture.memory.cloudAuthUser as MemoryRow[]).push({
      id: userId,
      name: 'Legacy User',
      email,
      emailVerified: true,
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    });
    (fixture.memory.cloudAuthProviderAccount as MemoryRow[]).push({
      id: 'legacy-credential-1',
      userId,
      accountId: userId,
      providerId: 'credential',
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    const signIn = await fixture.post('/sign-in/email', { email, password: PASSWORD });

    expect(signIn.status).toBe(200);
    await expect(signIn.json()).resolves.toMatchObject({
      token: expect.any(String),
      user: { id: userId, email, emailVerified: true },
    });
  });

  it('verifies a valid email token and then issues a session token', async () => {
    const fixture = createAuthFlowFixture();
    const email = 'person@example.com';
    await fixture.post('/sign-up/email', { email, password: PASSWORD, name: 'Person' });
    const verificationUrl = fixture.sentEmails[0]?.url;
    expect(verificationUrl).toBeDefined();

    const verification = await fixture.auth.handler(new Request(verificationUrl!));

    expect(verification.status).toBe(302);
    expect(verification.headers.get('location')).toBe('/');
    expect((fixture.memory.cloudAuthUser as MemoryRow[])[0]?.emailVerified).toBe(true);

    const signIn = await fixture.post('/sign-in/email', { email, password: PASSWORD });
    expect(signIn.status).toBe(200);
    await expect(signIn.json()).resolves.toMatchObject({
      token: expect.any(String),
      user: { email, emailVerified: true },
    });
  });

  it('rejects invalid and expired email verification tokens', async () => {
    const fixture = createAuthFlowFixture();
    const email = 'person@example.com';
    await fixture.post('/sign-up/email', { email, password: PASSWORD, name: 'Person' });

    const invalid = await fixture.request('/verify-email?token=invalid-token');
    expect(invalid.status).toBe(401);
    await expect(invalid.json()).resolves.toMatchObject({ code: 'INVALID_TOKEN' });

    const expiredToken = await createEmailVerificationToken(SECRET, email, undefined, -1);
    const expired = await fixture.request(`/verify-email?token=${expiredToken}`);
    expect(expired.status).toBe(401);
    await expect(expired.json()).resolves.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });
});

describe('account security', () => {
  async function signedIn() {
    const fixture = createAuthFlowFixture();
    await fixture.post('/sign-up/email', {
      email: 'old@example.com',
      password: PASSWORD,
      name: 'Person',
    });
    const link = fixture.sentEmails[0]!.url!;
    expect((await fixture.auth.handler(new Request(link))).status).toBe(302);
    const signIn = await fixture.post('/sign-in/email', {
      email: 'old@example.com',
      password: PASSWORD,
    });
    const { token } = (await signIn.json()) as { token: string };
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const post = (path: string, body: unknown) =>
      fixture.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
    return { ...fixture, headers, securedPost: post };
  }

  const NEXT_PASSWORD = 'Next-password-456';
  type Challenge = { challengeId: string; retryAfterSeconds: number; expiresInSeconds: number };
  type Proof = { verificationToken: string };

  async function requestCode(
    fixture: Awaited<ReturnType<typeof signedIn>>,
    purpose: 'change-password' | 'change-email',
    email = 'old@example.com',
  ) {
    const response = await fixture.securedPost('/account-security/request-verification', {
      purpose,
    });
    expect(response.status).toBe(200);
    const challenge = (await response.json()) as Challenge;
    const message = fixture.sentEmails.at(-1)!;
    expect(message).toMatchObject({ kind: 'account-security-code', email });
    return { challengeId: challenge.challengeId, code: message.code! };
  }

  async function grantFor(
    fixture: Awaited<ReturnType<typeof signedIn>>,
    purpose: 'change-password' | 'change-email',
  ) {
    const { challengeId, code } = await requestCode(fixture, purpose);
    const response = await fixture.securedPost('/account-security/verify-email-code', {
      purpose,
      challengeId,
      code,
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as Proof).verificationToken;
  }

  it('requires the current mailbox code before changing the password', async () => {
    const fixture = await signedIn();
    expect(
      (
        await fixture.securedPost('/change-password', {
          currentPassword: PASSWORD,
          newPassword: NEXT_PASSWORD,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fixture.securedPost('/account-security/change-password', {
          currentPassword: PASSWORD,
          newPassword: NEXT_PASSWORD,
        })
      ).status,
    ).toBe(400);

    const { challengeId, code } = await requestCode(fixture, 'change-password');
    expect(
      (
        await fixture.securedPost('/account-security/change-password', {
          currentPassword: PASSWORD,
          newPassword: NEXT_PASSWORD,
          verificationToken: 'x'.repeat(43),
        })
      ).status,
    ).toBe(403);
    const wrongCode = await fixture.securedPost('/account-security/verify-email-code', {
      purpose: 'change-password',
      challengeId,
      code: code === '000000' ? '000001' : '000000',
    });
    expect(wrongCode.status).toBe(400);
    expect(await wrongCode.json()).toMatchObject({ code: 'ACCOUNT_VERIFICATION_INVALID' });

    const verified = await fixture.securedPost('/account-security/verify-email-code', {
      purpose: 'change-password',
      challengeId,
      code,
    });
    expect(verified.status).toBe(200);
    const { verificationToken } = (await verified.json()) as Proof;

    const wrongPassword = await fixture.securedPost('/account-security/change-password', {
      currentPassword: 'incorrect-password',
      newPassword: NEXT_PASSWORD,
      verificationToken,
    });
    expect(wrongPassword.status).toBe(400);
    expect(await wrongPassword.json()).toMatchObject({ code: 'INVALID_PASSWORD' });

    expect(
      (
        await fixture.securedPost('/account-security/change-password', {
          currentPassword: PASSWORD,
          newPassword: NEXT_PASSWORD,
          verificationToken,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fixture.securedPost('/account-security/change-password', {
          currentPassword: NEXT_PASSWORD,
          newPassword: 'Third-password-789',
          verificationToken,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fixture.securedPost('/account-security/verify-email-code', {
          purpose: 'change-password',
          challengeId,
          code,
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await fixture.post('/sign-in/email', {
          email: 'old@example.com',
          password: PASSWORD,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fixture.post('/sign-in/email', {
          email: 'old@example.com',
          password: NEXT_PASSWORD,
        })
      ).status,
    ).toBe(200);
  });

  it('rejects proofs from another session, purpose, account or a tampered challenge', async () => {
    const fixture = await signedIn();
    const verificationToken = await grantFor(fixture, 'change-password');
    const otherSignIn = await fixture.post('/sign-in/email', {
      email: 'old@example.com',
      password: PASSWORD,
    });
    const otherToken = ((await otherSignIn.json()) as { token: string }).token;
    const otherHeaders = {
      authorization: `Bearer ${otherToken}`,
      'content-type': 'application/json',
    };
    const otherSession = (path: string, body: unknown) =>
      fixture.request(path, { method: 'POST', headers: otherHeaders, body: JSON.stringify(body) });

    expect(
      (
        await otherSession('/account-security/change-password', {
          currentPassword: PASSWORD,
          newPassword: NEXT_PASSWORD,
          verificationToken,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fixture.securedPost('/account-security/change-email', {
          password: PASSWORD,
          newEmail: 'new@example.com',
          verificationToken,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fixture.securedPost('/account-security/change-password', {
          currentPassword: PASSWORD,
          newPassword: NEXT_PASSWORD,
          verificationToken: `${verificationToken.slice(0, -1)}x`,
        })
      ).status,
    ).toBe(403);

    const { challengeId } = await requestCode(fixture, 'change-email');
    expect(
      (
        await fixture.securedPost('/account-security/verify-email-code', {
          purpose: 'change-email',
          challengeId: '00000000-0000-4000-8000-000000000000',
          code: '123456',
        })
      ).status,
    ).toBe(400);

    await fixture.post('/sign-up/email', {
      email: 'other@example.com',
      password: PASSWORD,
      name: 'Other',
    });
    const otherVerification = fixture.sentEmails.at(-1)!.url!;
    expect((await fixture.auth.handler(new Request(otherVerification))).status).toBe(302);
    const otherAccountSignIn = await fixture.post('/sign-in/email', {
      email: 'other@example.com',
      password: PASSWORD,
    });
    const otherAccountToken = ((await otherAccountSignIn.json()) as { token: string }).token;
    expect(
      (
        await fixture.request('/account-security/change-password', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${otherAccountToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword: PASSWORD,
            newPassword: NEXT_PASSWORD,
            verificationToken,
          }),
        })
      ).status,
    ).toBe(403);
  });

  it('refuses passwordless accounts instead of opening a verification-only bypass', async () => {
    const fixture = await signedIn();
    const accounts = fixture.memory.cloudAuthProviderAccount as MemoryRow[];
    for (let index = accounts.length - 1; index >= 0; index -= 1) {
      if (accounts[index]!.providerId === 'credential') accounts.splice(index, 1);
    }
    const passwordToken = await grantFor(fixture, 'change-password');
    const passwordChange = await fixture.securedPost('/account-security/change-password', {
      currentPassword: PASSWORD,
      newPassword: NEXT_PASSWORD,
      verificationToken: passwordToken,
    });
    expect(passwordChange.status).toBe(400);
    expect(await passwordChange.json()).toMatchObject({ code: 'PASSWORD_NOT_SET' });

    const emailToken = await grantFor(fixture, 'change-email');
    const emailChange = await fixture.securedPost('/account-security/change-email', {
      password: PASSWORD,
      newEmail: 'new@example.com',
      verificationToken: emailToken,
    });
    expect(emailChange.status).toBe(400);
    expect(await emailChange.json()).toMatchObject({ code: 'PASSWORD_NOT_SET' });
    expect(fixture.memory.cloudAuthUser[0]?.email).toBe('old@example.com');
  });

  it('rejects expired grants and limits repeated sends', async () => {
    const fixture = await signedIn();
    const verificationToken = await grantFor(fixture, 'change-password');
    const grant = (fixture.memory.cloudAuthVerification as MemoryRow[]).find((row) =>
      String(row.identifier).startsWith('account-security:grant:'),
    )!;
    grant.expiresAt = new Date(Date.now() - 1000);
    expect(
      (
        await fixture.securedPost('/account-security/change-password', {
          currentPassword: PASSWORD,
          newPassword: NEXT_PASSWORD,
          verificationToken,
        })
      ).status,
    ).toBe(403);

    // The resend cooldown is per minute; age the previous send so this test
    // exercises expiry instead of the throttle.
    // Adapter deletes replace the backing array, so re-read it each step.
    const rows = () => fixture.memory.cloudAuthVerification as MemoryRow[];
    for (let index = rows().length - 1; index >= 0; index -= 1) {
      const row = rows()[index]!;
      const identifier = String(row.identifier);
      if (identifier.startsWith('account-security:send:')) rows().splice(index, 1);
      else if (identifier.endsWith(':active')) {
        const value = JSON.parse(String(row.value)) as { sentAt: number };
        row.value = JSON.stringify({ ...value, sentAt: value.sentAt - 61_000 });
      }
    }
    const { challengeId, code } = await requestCode(fixture, 'change-password');
    const row = rows().find((candidate) =>
      String(candidate.identifier).endsWith(`:code:${challengeId}`),
    )!;
    row.expiresAt = new Date(Date.now() - 1000);
    expect(
      (
        await fixture.securedPost('/account-security/verify-email-code', {
          purpose: 'change-password',
          challengeId,
          code,
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await fixture.securedPost('/account-security/request-verification', {
          purpose: 'change-password',
        })
      ).status,
    ).toBe(429);
  });

  it('redeems a code and a grant at most once under concurrency', async () => {
    const fixture = await signedIn();
    const { challengeId, code } = await requestCode(fixture, 'change-password');
    const verifications = await Promise.all([
      fixture.securedPost('/account-security/verify-email-code', {
        purpose: 'change-password',
        challengeId,
        code,
      }),
      fixture.securedPost('/account-security/verify-email-code', {
        purpose: 'change-password',
        challengeId,
        code,
      }),
    ]);
    expect(verifications.map((response) => response.status).sort()).toEqual([200, 400]);
    const winner = verifications.find((response) => response.status === 200)!;
    const { verificationToken } = (await winner.json()) as Proof;

    const changes = await Promise.all([
      fixture.securedPost('/account-security/change-password', {
        currentPassword: PASSWORD,
        newPassword: NEXT_PASSWORD,
        verificationToken,
      }),
      fixture.securedPost('/account-security/change-password', {
        currentPassword: PASSWORD,
        newPassword: 'Third-password-789',
        verificationToken,
      }),
    ]);
    expect(changes.map((response) => response.status).sort()).toEqual([200, 403]);
    // Exactly the winning request's password is in effect; the loser never wrote.
    const signIns = await Promise.all(
      [PASSWORD, NEXT_PASSWORD, 'Third-password-789'].map((password) =>
        fixture.post('/sign-in/email', { email: 'old@example.com', password }),
      ),
    );
    expect(signIns.map((response) => response.status).sort()).toEqual([200, 401, 401]);
  });

  it('rechecks the password, verifies the new inbox and notifies the old inbox only after confirmation', async () => {
    const fixture = await signedIn();
    expect(
      (await fixture.securedPost('/change-email', { newEmail: 'bypass@example.com' })).status,
    ).toBe(404);
    const wrong = await fixture.securedPost('/account-security/change-email', {
      password: 'incorrect-password',
      newEmail: 'new@example.com',
      verificationToken: 'x'.repeat(43),
    });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ code: 'INVALID_PASSWORD' });
    expect(fixture.sentEmails.filter((email) => email.kind === 'email-changed')).toHaveLength(0);

    const verificationToken = await grantFor(fixture, 'change-email');
    expect(
      (
        await fixture.securedPost('/account-security/change-email', {
          password: PASSWORD,
          newEmail: 'new@example.com',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fixture.securedPost('/account-security/change-email', {
          password: PASSWORD,
          newEmail: 'new@example.com',
          verificationToken,
        })
      ).status,
    ).toBe(200);
    expect(fixture.memory.cloudAuthUser[0]?.email).toBe('old@example.com');
    const link = fixture.sentEmails.at(-1)!;
    expect(link.email).toBe('new@example.com');
    expect(
      (await fixture.auth.handler(new Request(link.url!, { headers: fixture.headers }))).status,
    ).toBe(302);
    expect(fixture.memory.cloudAuthUser[0]?.email).toBe('new@example.com');
    expect(fixture.sentEmails.at(-1)).toMatchObject({
      kind: 'email-changed',
      email: 'old@example.com',
    });
    expect(
      (await fixture.post('/sign-in/email', { email: 'old@example.com', password: PASSWORD }))
        .status,
    ).toBe(401);
    expect(
      (await fixture.post('/sign-in/email', { email: 'new@example.com', password: PASSWORD }))
        .status,
    ).toBe(200);
  });

  it('rejects tampered and expired change-email links without changing the login email', async () => {
    const fixture = await signedIn();
    const invalid = await fixture.request('/verify-email?token=invalid-token');
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toMatchObject({ code: 'INVALID_TOKEN' });
    const token = await createEmailVerificationToken(
      SECRET,
      'old@example.com',
      'new@example.com',
      -1,
      { requestType: 'change-email-verification' },
    );
    const expired = await fixture.request(`/verify-email?token=${token}`);
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(fixture.memory.cloudAuthUser[0]?.email).toBe('old@example.com');
  });

  it('lists sessions without tokens and revokes only another session owned by the user', async () => {
    const fixture = await signedIn();
    await fixture.post('/sign-in/email', { email: 'old@example.com', password: PASSWORD });
    const list = await fixture.request('/account-security/sessions', { headers: fixture.headers });
    expect(list.status).toBe(200);
    const sessions = (await list.json()) as Array<{ id: string; current: boolean }>;
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    expect(sessions.every((s) => !('token' in s))).toBe(true);
    expect(
      (
        await fixture.securedPost('/account-security/revoke-session', {
          sessionId: sessions.find((s) => s.current)!.id,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fixture.securedPost('/account-security/revoke-session', {
          sessionId: 'another-users-session',
        })
      ).status,
    ).toBe(400);
    const other = sessions.find((s) => !s.current)!;
    expect(
      (await fixture.securedPost('/account-security/revoke-session', { sessionId: other.id }))
        .status,
    ).toBe(200);
    expect(fixture.memory.cloudAuthSession).toHaveLength(1);
  });

  it('requires both password and the exact deletion word on the server', async () => {
    const fixture = await signedIn();
    expect(
      (
        await fixture.securedPost('/account-security/delete-account', {
          password: PASSWORD,
          confirmation: 'delete',
        })
      ).status,
    ).toBe(400);
    const response = await fixture.securedPost('/account-security/delete-account', {
      password: 'incorrect-password',
      confirmation: 'DELETE',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_PASSWORD' });
    expect(fixture.memory.cloudAuthUser).toHaveLength(1);
  });
});
