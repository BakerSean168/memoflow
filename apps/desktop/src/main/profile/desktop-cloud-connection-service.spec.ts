import { describe, expect, it, vi } from 'vitest';
import { DesktopCloudConnectionManager } from './desktop-cloud-connection-manager';
import { DesktopCloudConnectionService } from './desktop-cloud-connection-service';
vi.mock('../utils/api-config', () => ({ getApiBaseUrl: () => 'https://memo.test/api/v1' }));
const auth = {
  account: { id: 'account-1', email: 'user@example.com', name: 'User', emailVerified: true },
  session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
  requiresEmailVerification: false,
};
function fixture() {
  const runtime = {
    getProfileGeneration: () => 0,
    listProfiles: vi.fn().mockResolvedValue([]),
    runExclusive: <T>(fn: () => Promise<T>) => fn(),
    getActiveProfileId: vi.fn(() => 'guest-1'),
    getActiveProfileDescriptorSync: vi.fn(() => ({ profileId: 'guest-1', cloudBinding: null })),
    disableCloudSync: vi.fn().mockResolvedValue(undefined),
    registerCloudProfile: vi.fn().mockResolvedValue({ profileId: 'cloud-1' }),
    hasPin: vi.fn().mockResolvedValue(false),
    enableCloudSync: vi.fn().mockResolvedValue(undefined),
  };
  const sessions = {
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn(),
    load: vi.fn(),
    getValidToken: vi.fn(),
  };
  const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  const manager = new DesktopCloudConnectionManager(sessions as never, runtime as never);
  return {
    manager,
    runtime,
    sessions,
    fetchImpl,
    service: new DesktopCloudConnectionService(
      runtime as never,
      sessions as never,
      manager,
      fetchImpl,
    ),
  };
}
describe('independent cloud Profile commit', () => {
  function reauthenticationFixture() {
    const result = fixture();
    result.runtime.getActiveProfileDescriptorSync.mockReturnValue({
      profileId: 'guest-1',
      cloudBinding: { cloudAccountId: auth.account.id },
    } as never);
    result.runtime.registerCloudProfile.mockResolvedValue({ profileId: 'guest-1' });
    return result;
  }

  it('drains an in-flight replacement before sign-out removes the session', async () => {
    const { service, runtime, sessions, manager, fetchImpl } = reauthenticationFixture();
    let finishSave!: () => void;
    sessions.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const connecting = service.connect('guest-1', auth, 'token', { intent: 'reauthenticate' });
    await vi.waitFor(() => expect(sessions.save).toHaveBeenCalledOnce());
    const signingOut = manager.clearSession('guest-1');
    await Promise.resolve();
    expect(sessions.remove).not.toHaveBeenCalled();
    finishSave();
    await Promise.all([connecting, signingOut]);
    expect(sessions.save).toHaveBeenCalledBefore(sessions.remove);
    expect(sessions.remove).toHaveBeenCalledOnce();
    expect(runtime.enableCloudSync).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps completed sync credentials scoped to the active Profile after the attempt ends', async () => {
    const { service, runtime, sessions } = reauthenticationFixture();
    const attempt = new AbortController();
    sessions.getValidToken.mockResolvedValue('token');
    await expect(
      service.connect('guest-1', auth, 'token', { intent: 'reauthenticate' }, attempt.signal),
    ).resolves.toMatchObject({ ok: true });
    const credentials = runtime.enableCloudSync.mock.calls[0]![0];
    attempt.abort();
    await expect(credentials.getAccessToken()).resolves.toBe('token');
    expect(runtime.disableCloudSync).toHaveBeenCalledOnce();
    runtime.getActiveProfileId.mockReturnValue('other-profile');
    await expect(credentials.getAccessToken()).resolves.toBeNull();
  });

  it('cancels a pending sync connection without revoking the already committed session', async () => {
    const { service, runtime, fetchImpl } = reauthenticationFixture();
    const attempt = new AbortController();
    let finishConnect!: () => void;
    runtime.enableCloudSync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishConnect = resolve;
        }),
    );
    const connecting = service.connect(
      'guest-1',
      auth,
      'token',
      { intent: 'reauthenticate' },
      attempt.signal,
    );
    await vi.waitFor(() => expect(runtime.enableCloudSync).toHaveBeenCalledOnce());
    runtime.disableCloudSync.mockImplementationOnce(async () => {
      finishConnect();
    });
    attempt.abort();
    await expect(connecting).resolves.toMatchObject({
      ok: true,
      data: { activation: 'sync_pending' },
    });
    expect(runtime.disableCloudSync).toHaveBeenCalledTimes(2);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('saves under the independent target without reading or modifying the source account', async () => {
    const { service, sessions, runtime, fetchImpl } = fixture();
    expect(await service.connect('guest-1', auth, 'token', { intent: 'add_account' })).toEqual({
      ok: true,
      data: { targetProfileId: 'cloud-1', activation: 'pending' },
    });
    expect(sessions.save).toHaveBeenCalledWith(
      'cloud-1',
      expect.objectContaining({ token: 'token', account: auth.account }),
    );
    expect(runtime.enableCloudSync).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects a different identity during reauthentication', async () => {
    const { service, sessions, runtime, fetchImpl } = fixture();
    runtime.getActiveProfileDescriptorSync.mockReturnValue({
      profileId: 'guest-1',
      cloudBinding: { cloudAccountId: 'another' },
    } as never);
    expect(
      await service.connect('guest-1', auth, 'token', { intent: 'reauthenticate' }),
    ).toMatchObject({ ok: false, error: { code: 'CLOUD_IDENTITY_MISMATCH' } });
    expect(sessions.save).not.toHaveBeenCalled();
    expect(runtime.registerCloudProfile).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('preserves an existing target session if the replacement cannot be saved', async () => {
    const { service, sessions, fetchImpl } = fixture();
    sessions.save.mockRejectedValue(new Error('storage unavailable'));
    expect(
      await service.connect('guest-1', auth, 'token', { intent: 'add_account' }),
    ).toMatchObject({ ok: false });
    expect(sessions.remove).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('commits authentication but defers opening a protected target to local PIN entry', async () => {
    const { service, runtime } = fixture();
    runtime.hasPin.mockResolvedValue(true);
    expect(
      await service.connect('guest-1', auth, 'token', { intent: 'add_account' }),
    ).toMatchObject({ ok: true, data: { activation: 'pin_required' } });
  });
  it('revokes an unadopted token if cancellation happens before commit', async () => {
    const { service, sessions, runtime } = fixture();
    const controller = new AbortController();
    runtime.registerCloudProfile.mockImplementation(async () => {
      controller.abort();
      return { profileId: 'cloud-1' };
    });
    expect(
      await service.connect('guest-1', auth, 'token', { intent: 'add_account' }, controller.signal),
    ).toMatchObject({ ok: false });
    expect(sessions.save).not.toHaveBeenCalled();
  });
});
