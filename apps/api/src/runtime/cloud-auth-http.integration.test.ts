import request from 'supertest';
import type { Express } from 'express';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudAuth, createCloudAuthEmailLinkCapture } from '@memoflow/cloud-auth/server';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
} from '@memoflow/test-utils/setup/integration-helpers';
import { ApiBootstrapper } from '../bootstrap';

const origin = 'http://localhost:5173';
const password = 'Correct-password-123';
let app: Express;
let host: ApiBootstrapper;
let capture: ReturnType<typeof createCloudAuthEmailLinkCapture>;

beforeEach(async () => {
  await cleanAll();
  const db = await getPrisma();
  capture = createCloudAuthEmailLinkCapture({ send: async () => {} });
  const auth = createCloudAuth({
    database: db,
    secret: 'http-auth-integration-secret-at-least-thirty-two-characters',
    baseUrl: 'http://localhost:3000/api/auth',
    deviceVerificationUrl: `${origin}/auth/device`,
    trustedOrigins: [origin],
    rateLimit: { enabled: false },
    // This contract exercises real auth persistence; Account projection is a separate owner.
    userProvisioner: { provision: vi.fn() },
    emailDelivery: capture.delivery,
  });
  host = new ApiBootstrapper(db, auth);
  app = await host.init();
});
afterEach(async () => host.destroy());
afterAll(disconnectPrisma);

function post(path: string, body: object) {
  return request(app)
    .post(`/api/auth${path}`)
    .set('host', 'localhost:3000')
    .set('origin', origin)
    .send(body);
}

async function registerVerified(email: string) {
  const signup = await post('/sign-up/email', { email, password, name: 'HTTP Auth' });
  expect(signup.status, JSON.stringify(signup.body)).toBe(200);
  const db = await getPrisma();
  expect(await db.cloudAuthUser.findUniqueOrThrow({ where: { email } })).toMatchObject({
    emailVerified: false,
  });
  const blocked = await post('/sign-in/email', { email, password });
  expect(blocked.status).toBe(403);
  expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');
  const link = capture.findLatest(email, 'email-verification');
  expect(link).not.toBeNull();
  const url = new URL(link!.url);
  const verified = await request(app).get(`${url.pathname}${url.search}`);
  expect(verified.status).toBe(302);
  const user = await db.cloudAuthUser.findUniqueOrThrow({ where: { email } });
  expect(user.emailVerified).toBe(true);
  return user;
}

describe('Cloud auth HTTP and PostgreSQL contracts', () => {
  it('verifies registration, rejects a wrong password and revokes the persisted cookie session on logout', async () => {
    const email = 'cookie-auth@example.test';
    const user = await registerVerified(email);
    const rejected = await post('/sign-in/email', { email, password: 'Wrong-password-123' });
    expect(rejected.status).toBe(401);
    expect(rejected.body.code).toBe('INVALID_EMAIL_OR_PASSWORD');

    const signedIn = await post('/sign-in/email', { email, password });
    expect(signedIn.status).toBe(200);
    const cookies = signedIn.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => /session_token=.*HttpOnly/i.test(cookie))).toBe(true);
    const cookie = cookies.map((value) => value.split(';')[0]).join('; ');
    const db = await getPrisma();
    const sessions = await db.cloudAuthSession.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
    const session = await request(app).get('/api/auth/get-session').set('cookie', cookie);
    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({ user: { id: user.id, emailVerified: true } });
    expect(session.body.session.id).toBe(sessions[0]!.id);

    const logout = await post('/sign-out', {}).set('cookie', cookie);
    expect(logout.status).toBe(200);
    expect(await db.cloudAuthSession.count({ where: { userId: user.id } })).toBe(0);
    const expired = await request(app).get('/api/auth/get-session').set('cookie', cookie);
    expect(expired.status).toBe(200);
    expect(expired.body).toBeNull();
  });

  it('resets the persisted credential through the captured email callback and consumes its token once', async () => {
    const email = 'reset-auth@example.test';
    const user = await registerVerified(email);
    const db = await getPrisma();
    const credential = await db.cloudAuthProviderAccount.findFirstOrThrow({
      where: { userId: user.id, providerId: 'credential' },
    });
    const requested = await post('/request-password-reset', {
      email,
      redirectTo: `${origin}/auth?scene=reset`,
    });
    expect(requested.status).toBe(200);
    const link = capture.findLatest(email, 'password-reset');
    expect(link).not.toBeNull();
    const url = new URL(link!.url);
    const callback = await request(app).get(`${url.pathname}${url.search}`);
    expect(callback.status).toBe(302);
    const token = new URL(callback.headers.location).searchParams.get('token');
    expect(token).toBeTruthy();
    const newPassword = 'Replacement-password-456';
    const reset = await post('/reset-password', { token, newPassword });
    expect(reset.status, JSON.stringify(reset.body)).toBe(200);
    const updated = await db.cloudAuthProviderAccount.findUniqueOrThrow({
      where: { id: credential.id },
    });
    expect(updated.password).not.toBe(credential.password);
    expect(updated.password).not.toBe(newPassword);
    const oldLogin = await post('/sign-in/email', { email, password });
    expect(oldLogin.status).toBe(401);
    expect(oldLogin.body.code).toBe('INVALID_EMAIL_OR_PASSWORD');
    expect((await post('/sign-in/email', { email, password: newPassword })).status).toBe(200);
    const replay = await post('/reset-password', { token, newPassword: `${newPassword}X` });
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('INVALID_TOKEN');
    expect(
      (await db.cloudAuthProviderAccount.findUniqueOrThrow({ where: { id: credential.id } }))
        .password,
    ).toBe(updated.password);
  });
});
