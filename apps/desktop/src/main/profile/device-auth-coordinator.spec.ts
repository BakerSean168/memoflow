import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { DeviceAuthCoordinator } from './device-auth-coordinator';

vi.mock('../utils/api-config', () => ({
  getApiBaseUrl: () => 'https://api.memo.test/api/v1',
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const deviceCode = {
  device_code: 'secret-device-code',
  user_code: 'ABCD1234',
  verification_uri_complete: 'https://app.memo.test/auth/device?user_code=ABCD1234',
  expires_in: 600,
  interval: 5,
};

async function waitFor(check: () => boolean): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition not reached');
}

describe('DeviceAuthCoordinator', () => {
  it('ignores a late device-code response after a newer request has replaced it', async () => {
    let release!: (response: Response) => void;
    const runtime = { getProfileGeneration: () => 0, getActiveProfileId: () => 'profile-1' };
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce(json(deviceCode));
    const coordinator = new DeviceAuthCoordinator(runtime as never, {} as never, {
      fetchImpl,
      openExternal: vi.fn().mockResolvedValue(undefined),
      sleep: () => new Promise<void>(() => undefined),
    });
    const old = coordinator.begin();
    const current = await coordinator.begin();
    release(json(deviceCode));
    expect(await old).toMatchObject({ ok: false, error: { code: 'CLOUD_CONNECTION_CANCELLED' } });
    expect(current.ok).toBe(true);
    expect(coordinator.getCurrent()).toMatchObject(current);
    coordinator.dispose();
  });

  it('revokes a token arriving after cancellation during session resolution', async () => {
    let release!: (response: Response) => void;
    const runtime = { getProfileGeneration: () => 0, getActiveProfileId: () => 'profile-1' };
    const connection = { connect: vi.fn(), revoke: vi.fn().mockResolvedValue(undefined) };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(deviceCode))
      .mockResolvedValueOnce(json({ access_token: 'late-token', token_type: 'Bearer' }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      );
    const coordinator = new DeviceAuthCoordinator(runtime as never, connection as never, {
      fetchImpl,
      openExternal: vi.fn().mockResolvedValue(undefined),
      sleep: async () => undefined,
    });
    const begun = await coordinator.begin();
    if (!begun.ok) throw new Error('begin failed');
    await waitFor(() => fetchImpl.mock.calls.length === 3);
    coordinator.cancel(begun.data.attemptId);
    release(
      json({
        user: { id: 'account-1', email: 'user@example.com', name: 'User' },
        session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
      }),
    );
    await waitFor(() => connection.revoke.mock.calls.length === 1);
    expect(connection.connect).not.toHaveBeenCalled();
    expect(connection.revoke).toHaveBeenCalledWith('late-token');
    expect(coordinator.getStatus(begun.data.attemptId)).toMatchObject({
      ok: true,
      data: { status: 'cancelled' },
    });
  });

  it('keeps the device secret in main and connects the captured Profile after approval', async () => {
    const runtime = { getProfileGeneration: () => 0, getActiveProfileId: vi.fn(() => 'profile-1') };
    const connection = {
      connect: vi
        .fn()
        .mockResolvedValue(ok({ targetProfileId: 'profile-2', activation: 'pending' })),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(deviceCode))
      .mockResolvedValueOnce(
        json({
          access_token: 'desktop-bearer-token',
          token_type: 'Bearer',
          expires_in: 604800,
        }),
      )
      .mockResolvedValueOnce(
        json({
          user: { id: 'account-1', email: 'user@example.com', name: 'User', emailVerified: true },
          session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
        }),
      );
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const coordinator = new DeviceAuthCoordinator(runtime as never, connection as never, {
      fetchImpl: fetchMock,
      openExternal,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const begun = await coordinator.begin();
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    expect(begun.data).not.toHaveProperty('deviceCode');
    expect(JSON.stringify(begun.data)).not.toContain('secret-device-code');
    expect(openExternal).toHaveBeenCalledWith(begun.data.verificationUrl);

    await waitFor(() => connection.connect.mock.calls.length === 1);
    expect(connection.connect).toHaveBeenCalledWith(
      'profile-1',
      expect.objectContaining({
        account: expect.objectContaining({ id: 'account-1' }),
        session: expect.objectContaining({ id: 'session-1' }),
      }),
      'desktop-bearer-token',
      { intent: 'add_account' },
      expect.any(AbortSignal),
    );
    expect(coordinator.getStatus(begun.data.attemptId)).toMatchObject({
      ok: true,
      data: { status: 'connected' },
    });
    expect(coordinator.getCurrent()).toMatchObject({
      ok: true,
      data: { attemptId: begun.data.attemptId, status: 'connected' },
    });
  });

  it('cancels authorization when the active Profile changes before token exchange', async () => {
    let activeProfileId: string | null = 'profile-1';
    const runtime = {
      getProfileGeneration: () => 0,
      getActiveProfileId: vi.fn(() => activeProfileId),
    };
    const connection = { connect: vi.fn() };
    let releaseSleep: (() => void) | undefined;
    const sleep = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseSleep = resolve;
        }),
    );
    const fetchMock = vi.fn().mockImplementation(async () => json(deviceCode));
    const coordinator = new DeviceAuthCoordinator(runtime as never, connection as never, {
      fetchImpl: fetchMock,
      openExternal: vi.fn().mockResolvedValue(undefined),
      sleep,
    });

    const begun = await coordinator.begin();
    if (!begun.ok) throw new Error('begin failed');
    activeProfileId = 'profile-2';
    releaseSleep?.();
    await waitFor(() => fetchMock.mock.calls.length >= 1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(connection.connect).not.toHaveBeenCalled();
    expect(coordinator.getStatus(begun.data.attemptId)).toMatchObject({
      ok: false,
      error: { code: 'CLOUD_CONNECTION_ATTEMPT_NOT_FOUND' },
    });
  });

  it.each([
    ['access_denied', 'denied'],
    ['expired_token', 'expired'],
    ['invalid_grant', 'failed'],
  ] as const)('maps %s to the %s terminal state', async (errorCode, expectedStatus) => {
    const runtime = { getProfileGeneration: () => 0, getActiveProfileId: vi.fn(() => 'profile-1') };
    const connection = { connect: vi.fn() };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(deviceCode))
      .mockResolvedValueOnce(json({ error: errorCode, error_description: errorCode }, 400));
    const coordinator = new DeviceAuthCoordinator(runtime as never, connection as never, {
      fetchImpl: fetchMock,
      openExternal: vi.fn().mockResolvedValue(undefined),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const begun = await coordinator.begin();
    if (!begun.ok) throw new Error('begin failed');
    await waitFor(() => {
      const status = coordinator.getStatus(begun.data.attemptId);
      return status.ok && status.data.status === expectedStatus;
    });

    expect(connection.connect).not.toHaveBeenCalled();
  });

  it('honors pending and slow_down before connecting', async () => {
    const runtime = { getProfileGeneration: () => 0, getActiveProfileId: vi.fn(() => 'profile-1') };
    const connection = {
      connect: vi
        .fn()
        .mockResolvedValue(ok({ targetProfileId: 'profile-2', activation: 'pending' })),
    };
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(deviceCode))
      .mockResolvedValueOnce(json({ error: 'authorization_pending' }, 400))
      .mockResolvedValueOnce(json({ error: 'slow_down' }, 400))
      .mockResolvedValueOnce(
        json({ access_token: 'token-1', token_type: 'Bearer', expires_in: 60 }),
      )
      .mockResolvedValueOnce(
        json({
          user: { id: 'account-1', email: 'user@example.com', name: 'User' },
          session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
        }),
      );
    const coordinator = new DeviceAuthCoordinator(runtime as never, connection as never, {
      fetchImpl: fetchMock,
      openExternal: vi.fn().mockResolvedValue(undefined),
      sleep,
    });

    const begun = await coordinator.begin();
    if (!begun.ok) throw new Error('begin failed');
    await waitFor(() => connection.connect.mock.calls.length === 1);

    expect(sleep.mock.calls.slice(0, 3).map(([milliseconds]) => milliseconds)).toEqual([
      5_000, 5_000, 10_000,
    ]);
  });

  it('uses bounded exponential backoff with jitter for transient network failures', async () => {
    const runtime = { getProfileGeneration: () => 0, getActiveProfileId: vi.fn(() => 'profile-1') };
    const connection = {
      connect: vi
        .fn()
        .mockResolvedValue(ok({ targetProfileId: 'profile-2', activation: 'pending' })),
    };
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(deviceCode))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(json({ error: 'access_denied' }, 400));
    const coordinator = new DeviceAuthCoordinator(runtime as never, connection as never, {
      fetchImpl: fetchMock,
      openExternal: vi.fn().mockResolvedValue(undefined),
      sleep,
      random: () => 0.5,
    });

    const begun = await coordinator.begin();
    if (!begun.ok) throw new Error('begin failed');
    await waitFor(() => {
      const status = coordinator.getStatus(begun.data.attemptId);
      return status.ok && status.data.status === 'denied';
    });

    expect(sleep.mock.calls.slice(0, 2).map(([milliseconds]) => milliseconds)).toEqual([
      5_000, 11_000,
    ]);
  });

  it('uses bounded exponential backoff with jitter for transient server failures', async () => {
    const runtime = { getProfileGeneration: () => 0, getActiveProfileId: vi.fn(() => 'profile-1') };
    const connection = { connect: vi.fn() };
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(deviceCode))
      .mockResolvedValueOnce(json({ error: 'server_error' }, 503))
      .mockResolvedValueOnce(json({ error: 'access_denied' }, 400));
    const coordinator = new DeviceAuthCoordinator(runtime as never, connection as never, {
      fetchImpl: fetchMock,
      openExternal: vi.fn().mockResolvedValue(undefined),
      sleep,
      random: () => 0.5,
    });

    const begun = await coordinator.begin();
    if (!begun.ok) throw new Error('begin failed');
    await waitFor(() => {
      const status = coordinator.getStatus(begun.data.attemptId);
      return status.ok && status.data.status === 'denied';
    });

    expect(sleep.mock.calls.slice(0, 2).map(([milliseconds]) => milliseconds)).toEqual([
      5_000, 11_000,
    ]);
    expect(connection.connect).not.toHaveBeenCalled();
  });

  it('cancels a pending attempt without polling the token endpoint', async () => {
    const runtime = { getProfileGeneration: () => 0, getActiveProfileId: vi.fn(() => 'profile-1') };
    let releaseSleep: (() => void) | undefined;
    const sleep = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseSleep = resolve;
        }),
    );
    const fetchMock = vi.fn().mockResolvedValue(json(deviceCode));
    const coordinator = new DeviceAuthCoordinator(runtime as never, { connect: vi.fn() } as never, {
      fetchImpl: fetchMock,
      openExternal: vi.fn().mockResolvedValue(undefined),
      sleep,
    });

    const begun = await coordinator.begin();
    if (!begun.ok) throw new Error('begin failed');
    expect(coordinator.cancel(begun.data.attemptId)).toMatchObject({ ok: true });
    releaseSleep?.();

    expect(coordinator.getStatus(begun.data.attemptId)).toMatchObject({
      ok: true,
      data: { status: 'cancelled' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forgets the current Profile attempt when cloud identity is disconnected', async () => {
    const runtime = { getProfileGeneration: () => 0, getActiveProfileId: vi.fn(() => 'profile-1') };
    const coordinator = new DeviceAuthCoordinator(runtime as never, { connect: vi.fn() } as never, {
      fetchImpl: vi.fn().mockResolvedValue(json(deviceCode)),
      openExternal: vi.fn().mockResolvedValue(undefined),
      sleep: vi.fn(() => new Promise<void>(() => undefined)),
    });

    const begun = await coordinator.begin();
    if (!begun.ok) throw new Error('begin failed');
    coordinator.clearForProfile('profile-1');

    expect(coordinator.getCurrent()).toEqual({ ok: true, data: null });
    expect(coordinator.getStatus(begun.data.attemptId)).toMatchObject({
      ok: false,
      error: { code: 'CLOUD_CONNECTION_ATTEMPT_NOT_FOUND' },
    });
  });

  it('expires locally without polling after the remaining lifetime elapses', async () => {
    let now = 1_000;
    const runtime = { getProfileGeneration: () => 0, getActiveProfileId: vi.fn(() => 'profile-1') };
    const sleep = vi.fn(async (milliseconds: number) => {
      now += milliseconds;
    });
    const fetchMock = vi.fn().mockResolvedValue(json({ ...deviceCode, expires_in: 2 }));
    const coordinator = new DeviceAuthCoordinator(runtime as never, { connect: vi.fn() } as never, {
      fetchImpl: fetchMock,
      openExternal: vi.fn().mockResolvedValue(undefined),
      sleep,
      now: () => now,
    });

    const begun = await coordinator.begin();
    if (!begun.ok) throw new Error('begin failed');
    await waitFor(() => {
      const status = coordinator.getStatus(begun.data.attemptId);
      return status.ok && status.data.status === 'expired';
    });

    expect(sleep).toHaveBeenCalledWith(2_000, expect.any(AbortSignal));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('replaces an older attempt for the same Profile', async () => {
    const runtime = { getProfileGeneration: () => 0, getActiveProfileId: vi.fn(() => 'profile-1') };
    const sleep = vi.fn(() => new Promise<void>(() => undefined));
    const fetchMock = vi.fn().mockImplementation(async () => json(deviceCode));
    const coordinator = new DeviceAuthCoordinator(runtime as never, { connect: vi.fn() } as never, {
      fetchImpl: fetchMock,
      openExternal: vi.fn().mockResolvedValue(undefined),
      sleep,
    });

    const first = await coordinator.begin();
    const second = await coordinator.begin();
    if (!first.ok || !second.ok) throw new Error('begin failed');

    expect(coordinator.getStatus(first.data.attemptId)).toMatchObject({
      ok: false,
      error: { code: 'CLOUD_CONNECTION_ATTEMPT_NOT_FOUND' },
    });
    expect(coordinator.getStatus(second.data.attemptId)).toMatchObject({
      ok: true,
      data: { status: 'awaiting_authorization' },
    });
  });

  it('revokes an exchanged token when session resolution fails without exposing it', async () => {
    const runtime = { getProfileGeneration: () => 0, getActiveProfileId: vi.fn(() => 'profile-1') };
    const connection = { connect: vi.fn(), revoke: vi.fn().mockResolvedValue(undefined) };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(deviceCode))
      .mockResolvedValueOnce(
        json({
          access_token: 'secret-bearer-token',
          token_type: 'Bearer',
          expires_in: 60,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const coordinator = new DeviceAuthCoordinator(runtime as never, connection as never, {
      fetchImpl: fetchMock,
      openExternal: vi.fn().mockResolvedValue(undefined),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const begun = await coordinator.begin();
    if (!begun.ok) throw new Error('begin failed');
    await waitFor(() => connection.revoke.mock.calls.length === 1);
    const status = coordinator.getStatus(begun.data.attemptId);

    expect(connection.revoke).toHaveBeenCalledWith('secret-bearer-token');
    expect(connection.connect).not.toHaveBeenCalled();
    expect(JSON.stringify(status)).not.toContain('secret-bearer-token');
    expect(JSON.stringify(status)).not.toContain('secret-device-code');
  });
});
