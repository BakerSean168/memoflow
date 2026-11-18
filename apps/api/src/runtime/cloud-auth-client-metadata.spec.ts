import request from 'supertest';
import { memoryAdapter, type MemoryDB } from 'better-auth/adapters/memory';
import { describe, expect, it, vi } from 'vitest';
import { buildDesktopUserAgent } from '@memoflow/cloud-auth-contracts';
import { createCloudAuth } from '@memoflow/cloud-auth/server';
import { ApiBootstrapper } from '../bootstrap';

const origin = 'http://localhost:5173';
const password = 'Correct-password-123';
type MemoryRow = Record<string, unknown> & { id: string };

/**
 * Runs the real Better Auth handler through the API host wiring (trust proxy →
 * cloud auth mount → session write) against an in-memory database, so the
 * assertions cover the metadata the device list will later read.
 */
async function fixture() {
  const memory: MemoryDB = {
    cloudAuthUser: [],
    cloudAuthSession: [],
    cloudAuthProviderAccount: [],
    cloudAuthVerification: [],
    cloudAuthDeviceCode: [],
  };
  const auth = createCloudAuth(
    {
      database: {
        cloudAuthUser: { findFirst: async () => null, findUnique: async () => null },
      } as never,
      secret: 'client-metadata-secret-at-least-thirty-two-characters',
      baseUrl: 'https://api.memo.test/api/auth',
      deviceVerificationUrl: `${origin}/auth/device`,
      trustedOrigins: [origin],
      rateLimit: { enabled: false },
      userProvisioner: { provision: vi.fn() },
      emailDelivery: { send: vi.fn() },
    },
    { database: memoryAdapter(memory) },
  );
  const host = new ApiBootstrapper(
    {} as never,
    auth,
    undefined,
    undefined,
    { github: false },
    1,
  );
  const app = await host.init();
  const users = () => memory.cloudAuthUser as MemoryRow[];
  const sessions = () => memory.cloudAuthSession as MemoryRow[];
  return { app, host, users, sessions };
}

async function registerVerified(
  app: Awaited<ReturnType<typeof fixture>>['app'],
  users: () => MemoryRow[],
  email: string,
) {
  const signup = await request(app)
    .post('/api/auth/sign-up/email')
    .set('host', 'api.memo.test')
    .set('origin', origin)
    .send({ email, password, name: 'Metadata' });
  expect(signup.status, JSON.stringify(signup.body)).toBe(200);
  expect(users()).toHaveLength(1);
  users()[0]!.emailVerified = true;
}

describe('cloud auth session metadata', () => {
  it('records the desktop User-Agent and the trusted forwarded client address', async () => {
    const { app, host, users, sessions } = await fixture();
    const email = 'desktop-metadata@example.test';
    await registerVerified(app, users, email);
    const userAgent = buildDesktopUserAgent('0.23.0', 'Windows');

    const signIn = await request(app)
      .post('/api/auth/sign-in/email')
      .set('host', 'api.memo.test')
      .set('origin', origin)
      // `172.18.0.7` is the proxy hop that used to win when the chain had two
      // entries; only the rightmost hop is trusted with API_TRUST_PROXY_HOPS=1.
      .set('x-forwarded-for', '198.51.100.77, 203.0.113.9')
      .set('x-real-ip', '172.18.0.7')
      .set('user-agent', userAgent)
      .send({ email, password });

    expect(signIn.status, JSON.stringify(signIn.body)).toBe(200);
    const stored = sessions();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ userAgent, ipAddress: '203.0.113.9' });

    const list = await request(app)
      .get('/api/auth/account-security/sessions')
      .set('host', 'api.memo.test')
      .set('authorization', `Bearer ${(signIn.body as { token: string }).token}`);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body).toEqual([
      expect.objectContaining({ userAgent, ipAddress: '203.0.113.9', current: true }),
    ]);

    await host.destroy();
  });

  it('keeps the legacy node User-Agent readable for sessions created before the client fix', async () => {
    const { app, host, users, sessions } = await fixture();
    const email = 'legacy-desktop@example.test';
    await registerVerified(app, users, email);

    const signIn = await request(app)
      .post('/api/auth/sign-in/email')
      .set('host', 'api.memo.test')
      .set('origin', origin)
      .set('x-forwarded-for', '203.0.113.9')
      .set('user-agent', 'node')
      .send({ email, password });

    expect(signIn.status, JSON.stringify(signIn.body)).toBe(200);
    expect(sessions()[0]).toMatchObject({ userAgent: 'node', ipAddress: '203.0.113.9' });

    await host.destroy();
  });
});
