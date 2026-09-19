import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ApiBootstrapper } from '../../bootstrap';
import { createCloudAuth } from '@memoflow/cloud-auth/server';

function createCloudAuthForExpressTest(closureChecker?: (identityId: string) => Promise<boolean>) {
  const closingUser = {
    id: 'identity-closed-100',
    email: 'closed-user@example.com',
    name: 'Closed User',
    emailVerified: true,
    disabledAt: new Date(),
  };

  const activeUser = {
    id: 'identity-active-200',
    email: 'active-user@example.com',
    name: 'Active User',
    emailVerified: true,
    disabledAt: null,
  };

  const closedSession = {
    id: 'session-closed-1',
    userId: closingUser.id,
    token: 'closed-session-token',
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    user: closingUser,
  };

  const activeSession = {
    id: 'session-active-1',
    userId: activeUser.id,
    token: 'active-session-token',
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    user: activeUser,
  };

  const database = {
    cloudAuthUser: {
      findFirst: vi.fn(async ({ where }: { where: { email: string } }) => {
        if (where.email === closingUser.email) return closingUser;
        if (where.email === activeUser.email) return activeUser;
        return null;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === closingUser.id) return closingUser;
        if (where.id === activeUser.id) return activeUser;
        return null;
      }),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    cloudAuthSession: {
      findFirst: vi.fn(async ({ where }: { where: { token?: string; userId?: string } }) => {
        if (where.token === closedSession.token) return closedSession;
        if (where.token === activeSession.token) return activeSession;
        return null;
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    cloudAuthDeviceCode: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const defaultClosureChecker = async (identityId: string) => {
    return identityId === closingUser.id;
  };

  return createCloudAuth({
    database: database as never,
    secret: 'test-secret-with-at-least-thirty-two-characters',
    baseUrl: 'http://localhost:3000/api/auth',
    deviceVerificationUrl: 'http://localhost:5173/auth/device',
    trustedOrigins: ['http://localhost:5173'],
    userProvisioner: { provision: vi.fn() },
    emailDelivery: { send: vi.fn() },
    closureChecker: closureChecker ?? defaultClosureChecker,
  });
}

describe('Express raw auth endpoint closure 403 (P0)', () => {
  it('blocks sign-in via Express raw POST endpoint before body parser for closed user returning 403', async () => {
    const cloudAuth = createCloudAuthForExpressTest();
    const app = await new ApiBootstrapper({}, cloudAuth).init();

    const response = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email: 'closed-user@example.com', password: 'password123' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Account closure in progress or completed',
      code: 'ACCOUNT_CLOSED',
    });
  });

  it('blocks get-session via Express endpoint with closed user session token returning 403', async () => {
    const cloudAuth = createCloudAuthForExpressTest();
    const app = await new ApiBootstrapper({}, cloudAuth).init();

    const response = await request(app)
      .get('/api/auth/get-session')
      .set('authorization', 'Bearer closed-session-token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Account closure in progress or completed',
      code: 'ACCOUNT_CLOSED',
    });
  });

  it('blocks refresh via Express endpoint with closed user session token returning 403', async () => {
    const cloudAuth = createCloudAuthForExpressTest();
    const app = await new ApiBootstrapper({}, cloudAuth).init();

    const response = await request(app)
      .post('/api/auth/refresh-token')
      .set('authorization', 'Bearer closed-session-token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Account closure in progress or completed',
      code: 'ACCOUNT_CLOSED',
    });
  });

  it('allows sign-in via Express endpoint for active normal user', async () => {
    const cloudAuth = createCloudAuthForExpressTest();
    const app = await new ApiBootstrapper({}, cloudAuth).init();

    const response = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email: 'active-user@example.com', password: 'password123' });

    // Active user proceeds past closure check to Better Auth raw handler (which may respond 200 or auth error, but NOT 403 ACCOUNT_CLOSED)
    expect(response.status).not.toBe(403);
  });
});
