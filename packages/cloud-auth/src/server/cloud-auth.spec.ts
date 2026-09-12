import { describe, expect, it, vi } from 'vitest';
import { createCloudAuth, type CloudPrincipal } from './cloud-auth.js';

function createFixture() {
  const createDeviceCode = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'device-record-1',
    ...data,
  }));
  const deleteDeviceCodes = vi.fn().mockResolvedValue({ count: 2 });
  const findDeviceCode = vi.fn().mockResolvedValue(null);
  const updateDeviceCode = vi.fn().mockResolvedValue(null);
  const deleteDeviceCode = vi.fn().mockResolvedValue(null);
  const user = {
    id: 'IdentityId_00000000-0000-4000-8000-000000000001',
    name: 'Device User',
    email: 'device@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const session = {
    id: 'session-1',
    userId: user.id,
    token: 'raw-device-session-token',
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    ipAddress: null,
    userAgent: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    user,
  };
  const database = {
    cloudAuthDeviceCode: {
      create: createDeviceCode,
      findFirst: findDeviceCode,
      update: updateDeviceCode,
      delete: deleteDeviceCode,
      deleteMany: deleteDeviceCodes,
    },
    cloudAuthSession: { findFirst: vi.fn().mockResolvedValue(session) },
    cloudAuthUser: { findFirst: vi.fn().mockResolvedValue(user) },
  };
  const auth = createCloudAuth({
    database: database as never,
    secret: 'test-secret-with-at-least-thirty-two-characters',
    baseUrl: 'https://api.memo.test/api/auth',
    deviceVerificationUrl: 'https://app.memo.test/auth/device',
    trustedOrigins: ['https://app.memo.test'],
    userProvisioner: { provision: vi.fn() },
    emailDelivery: { send: vi.fn() },
  });
  return {
    auth,
    createDeviceCode,
    findDeviceCode,
    deleteDeviceCode,
    deleteDeviceCodes,
  };
}

describe('cloud auth contract', () => {
  it('keeps local profile access out of the cloud principal', () => {
    const principal: CloudPrincipal = {
      identityId: 'user-id',
      sessionId: 'session-id',
      email: 'user@example.com',
      emailVerified: true,
    };

    expect(principal).not.toHaveProperty('profileId');
    expect(principal).not.toHaveProperty('profileUnlocked');
    expect(principal).not.toHaveProperty('guest');
  });

  it('issues a short-lived device authorization for the Desktop public client', async () => {
    const { auth, createDeviceCode } = createFixture();

    const response = await auth.handler(
      new Request('https://api.memo.test/api/auth/device/code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: 'memoflow-desktop' }),
      }),
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      verification_uri: 'https://app.memo.test/auth/device',
      expires_in: 600,
      interval: 5,
    });
    expect(payload.verification_uri_complete).toBe(
      `https://app.memo.test/auth/device?user_code=${payload.user_code}`,
    );
    expect(createDeviceCode).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'memoflow-desktop',
          status: 'pending',
          pollingInterval: 5_000,
        }),
      }),
    );
  });

  it('rejects unknown device authorization clients before persisting a code', async () => {
    const { auth, createDeviceCode } = createFixture();

    const response = await auth.handler(
      new Request('https://api.memo.test/api/auth/device/code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: 'unknown-client' }),
      }),
    );
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe('invalid_client');
    expect(createDeviceCode).not.toHaveBeenCalled();
  });

  it('accepts the raw session token issued by the standard device token endpoint', async () => {
    const { auth } = createFixture();

    const response = await auth.handler(
      new Request('https://api.memo.test/api/auth/get-session', {
        headers: { authorization: 'Bearer raw-device-session-token' },
      }),
    );
    const payload = (await response.json()) as {
      user?: { id?: string };
      session?: { id?: string };
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      user: { id: 'IdentityId_00000000-0000-4000-8000-000000000001' },
      session: { id: 'session-1' },
    });
  });

  it('returns expired_token for a grant whose stored UTC expiry is in the past', async () => {
    const { auth, findDeviceCode, deleteDeviceCode } = createFixture();
    findDeviceCode.mockResolvedValueOnce({
      id: 'expired-device-record',
      deviceCode: 'expired-device-code',
      userCode: 'EXPIRED1',
      userId: null,
      clientId: 'memoflow-desktop',
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      status: 'pending',
      lastPolledAt: null,
      pollingInterval: 5_000,
      scope: null,
    });

    const response = await auth.handler(
      new Request('https://api.memo.test/api/auth/device/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: 'expired-device-code',
          client_id: 'memoflow-desktop',
        }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({ error: 'expired_token' });
    expect(response.status).toBe(400);
    expect(deleteDeviceCode).toHaveBeenCalledWith({
      where: { id: 'expired-device-record' },
    });
  });

  it('removes expired unconsumed device codes', async () => {
    const { auth, deleteDeviceCodes } = createFixture();
    const now = new Date('2030-01-01T00:00:00.000Z');

    await expect(auth.cleanupExpiredDeviceCodes(now)).resolves.toBe(2);
    expect(deleteDeviceCodes).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
  });

  it('denies session resolution when closureChecker returns true', async () => {
    const closureChecker = vi.fn().mockResolvedValue(true);
    const user = {
      id: 'user-closing-123',
      email: 'closing@example.com',
      emailVerified: true,
      disabledAt: null,
    };
    const session = {
      id: 'session-123',
      userId: user.id,
      token: 'closing-token',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      user,
    };

    const database = {
      cloudAuthSession: { findFirst: vi.fn().mockResolvedValue(session) },
      cloudAuthUser: {
        findFirst: vi.fn().mockResolvedValue(user),
        findUnique: vi.fn().mockResolvedValue(user),
      },
      cloudAuthDeviceCode: { deleteMany: vi.fn() },
    };

    const auth = createCloudAuth({
      database: database as never,
      secret: 'test-secret-with-at-least-thirty-two-characters',
      baseUrl: 'https://api.memo.test/api/auth',
      deviceVerificationUrl: 'https://app.memo.test/auth/device',
      trustedOrigins: ['https://app.memo.test'],
      userProvisioner: { provision: vi.fn() },
      emailDelivery: { send: vi.fn() },
      closureChecker,
    });

    const headers = new Headers({ authorization: 'Bearer closing-token' });
    const principal = await auth.resolvePrincipal(headers);

    expect(principal).toBeNull();
    expect(closureChecker).toHaveBeenCalledWith(user.id);
  });

  it('denies session resolution from disabledAt alone when closure is no longer active', async () => {
    const closureChecker = vi.fn().mockResolvedValue(false);
    const user = {
      id: 'user-disabled-123',
      email: 'disabled@example.com',
      emailVerified: true,
      disabledAt: new Date('2026-09-10T12:00:00.000Z'),
    };
    const database = {
      cloudAuthSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'session-disabled-123',
          userId: user.id,
          token: 'disabled-token',
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
          user,
        }),
      },
      cloudAuthUser: {
        findFirst: vi.fn().mockResolvedValue(user),
        findUnique: vi.fn().mockResolvedValue(user),
      },
      cloudAuthDeviceCode: { deleteMany: vi.fn() },
    };

    const auth = createCloudAuth({
      database: database as never,
      secret: 'test-secret-with-at-least-thirty-two-characters',
      baseUrl: 'https://api.memo.test/api/auth',
      deviceVerificationUrl: 'https://app.memo.test/auth/device',
      trustedOrigins: ['https://app.memo.test'],
      userProvisioner: { provision: vi.fn() },
      emailDelivery: { send: vi.fn() },
      closureChecker,
    });

    await expect(
      auth.resolvePrincipal(new Headers({ authorization: 'Bearer disabled-token' })),
    ).resolves.toBeNull();
    expect(closureChecker).toHaveBeenCalledWith(user.id);
    expect(database.cloudAuthUser.findUnique).toHaveBeenCalledWith({
      where: { id: user.id },
      select: { disabledAt: true },
    });
  });

  it('does not block a valid session when the CloudAuthUser row is absent', async () => {
    const closureChecker = vi.fn().mockResolvedValue(false);
    const identityId = 'IdentityId_00000000-0000-4000-8000-000000000150';
    const user = {
      id: identityId,
      email: 'missing-row@example.com',
      emailVerified: true,
      disabledAt: null,
    };
    const database = {
      cloudAuthSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'session-missing-row-150',
          userId: identityId,
          token: 'missing-row-token-150',
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
          user,
        }),
      },
      cloudAuthUser: {
        findFirst: vi.fn().mockResolvedValue(user),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      cloudAuthDeviceCode: { deleteMany: vi.fn() },
    };

    const auth = createCloudAuth({
      database: database as never,
      secret: 'test-secret-with-at-least-thirty-two-characters',
      baseUrl: 'https://api.memo.test/api/auth',
      deviceVerificationUrl: 'https://app.memo.test/auth/device',
      trustedOrigins: ['https://app.memo.test'],
      userProvisioner: { provision: vi.fn() },
      emailDelivery: { send: vi.fn() },
      closureChecker,
    });

    await expect(
      auth.resolvePrincipal(new Headers({ authorization: 'Bearer missing-row-token-150' })),
    ).resolves.toMatchObject({ identityId, sessionId: 'session-missing-row-150' });
    expect(closureChecker).toHaveBeenCalledWith(identityId);
    expect(database.cloudAuthUser.findUnique).toHaveBeenCalledWith({
      where: { id: identityId },
      select: { disabledAt: true },
    });
  });

  it('revokes sessions and device grants without changing CloudAuthUser access state', async () => {
    const { auth, deleteDeviceCodes } = createFixture();
    const deleteSessions = vi.fn().mockResolvedValue({ count: 3 });
    const updateUser = vi.fn();
    const database = {
      cloudAuthSession: { deleteMany: deleteSessions },
      cloudAuthDeviceCode: { deleteMany: deleteDeviceCodes },
      cloudAuthUser: { updateMany: updateUser },
    };
    const revokingAuth = createCloudAuth({
      database: database as never,
      secret: 'test-secret-with-at-least-thirty-two-characters',
      baseUrl: 'https://api.memo.test/api/auth',
      deviceVerificationUrl: 'https://app.memo.test/auth/device',
      trustedOrigins: ['https://app.memo.test'],
      userProvisioner: { provision: vi.fn() },
      emailDelivery: { send: vi.fn() },
    });

    await expect(revokingAuth.revokeAllSessions('identity-1')).resolves.toEqual({
      revokedSessions: 3,
    });
    expect(deleteSessions).toHaveBeenCalledWith({ where: { userId: 'identity-1' } });
    expect(deleteDeviceCodes).toHaveBeenCalledWith({ where: { userId: 'identity-1' } });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('denies raw endpoint calls (/api/auth/get-session & sign-in) with 403 when closure is in progress', async () => {
    const closureChecker = vi.fn().mockResolvedValue(true);
    const user = {
      id: 'user-closing-456',
      email: 'closing-raw@example.com',
      emailVerified: true,
      disabledAt: null,
    };
    const session = {
      id: 'session-456',
      userId: user.id,
      token: 'raw-closing-token',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      user,
    };

    const database = {
      cloudAuthSession: { findFirst: vi.fn().mockResolvedValue(session) },
      cloudAuthUser: {
        findFirst: vi.fn().mockResolvedValue(user),
        findUnique: vi.fn().mockResolvedValue(user),
      },
      cloudAuthDeviceCode: { deleteMany: vi.fn() },
    };

    const auth = createCloudAuth({
      database: database as never,
      secret: 'test-secret-with-at-least-thirty-two-characters',
      baseUrl: 'https://api.memo.test/api/auth',
      deviceVerificationUrl: 'https://app.memo.test/auth/device',
      trustedOrigins: ['https://app.memo.test'],
      userProvisioner: { provision: vi.fn() },
      emailDelivery: { send: vi.fn() },
      closureChecker,
    });

    // Test raw get-session with Bearer token
    const getSessionRes = await auth.handler(
      new Request('https://api.memo.test/api/auth/get-session', {
        headers: { authorization: 'Bearer raw-closing-token' },
      }),
    );
    expect(getSessionRes.status).toBe(403);
    const body1 = (await getSessionRes.json()) as { error: string };
    expect(body1.error).toBe('Account closure in progress or completed');

    // Test raw sign-in with email body
    const signInRes = await auth.handler(
      new Request('https://api.memo.test/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'closing-raw@example.com', password: 'password123' }),
      }),
    );
    expect(signInRes.status).toBe(403);
    const body2 = (await signInRes.json()) as { error: string };
    expect(body2.error).toBe('Account closure in progress or completed');
  });
});
