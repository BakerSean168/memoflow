import { describe, expect, it, vi } from 'vitest';
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
    getActiveProfileDescriptorSync: vi.fn(() => ({ cloudBinding: null })),
    registerCloudProfile: vi.fn().mockResolvedValue({ profileId: 'cloud-1' }),
    hasPin: vi.fn().mockResolvedValue(false),
    enableCloudSync: vi.fn().mockResolvedValue(undefined),
  };
  const sessions = {
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn(),
    getValidToken: vi.fn(),
  };
  const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  return {
    runtime,
    sessions,
    fetchImpl,
    service: new DesktopCloudConnectionService(runtime as never, sessions as never, fetchImpl),
  };
}
describe('independent cloud Profile commit', () => {
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
