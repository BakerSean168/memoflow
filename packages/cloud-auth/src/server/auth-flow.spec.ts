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
  const sentEmails: Array<{ kind: string; email: string; url: string }> = [];
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
