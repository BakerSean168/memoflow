import { describe, expect, it, vi } from 'vitest';
import type { ProfileDescriptor } from './profile-registry';
import { DesktopCloudConnectionManager } from './desktop-cloud-connection-manager';

vi.mock('../utils/api-config', () => ({ getApiBaseUrl: () => 'https://memo.test/api/v1' }));

function profile(cloudAccountId: string | null): ProfileDescriptor {
  return {
    profileId: 'profile-1',
    profileKind: cloudAccountId ? 'registered' : 'guest',
    localOwnerId: cloudAccountId ?? 'guest-1',
    displayName: 'Profile',
    avatarSeed: 'seed',
    keyEnvelopeId: 'key-1',
    identifier: cloudAccountId ? 'user@example.com' : null,
    cloudBinding: cloudAccountId ? { cloudAccountId, boundAt: 1, lastValidatedAt: null } : null,
    lastActiveAt: 1,
    createdAt: 1,
    hasSnapshot: false,
    lastSnapshotVersion: null,
    lastSnapshotHydratedAt: null,
    status: 'ready',
  };
}

const stored = {
  token: 'token-1',
  sessionId: 'session-1',
  account: { id: 'account-1', email: 'user@example.com', name: 'User', emailVerified: true },
  expiresAt: '2030-01-01T00:00:00.000Z',
};

describe('DesktopCloudConnectionManager', () => {
  it('keeps unbound guest Profiles local-only without touching the network', async () => {
    const fetchImpl = vi.fn();
    const manager = new DesktopCloudConnectionManager(
      { load: vi.fn(), save: vi.fn() } as never,
      { enableCloudSync: vi.fn() } as never,
      fetchImpl,
    );
    await expect(manager.getState(profile(null))).resolves.toBe('UNBOUND');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('distinguishes offline, reauthentication and account mismatch', async () => {
    const sessions = { load: vi.fn().mockResolvedValue(stored), save: vi.fn() };
    const runtime = { enableCloudSync: vi.fn(), getActiveProfileId: () => 'profile-1' };
    const offline = new DesktopCloudConnectionManager(
      sessions as never,
      runtime as never,
      vi.fn().mockRejectedValue(new Error('offline')),
    );
    await expect(offline.getState(profile('account-1'))).resolves.toBe('OFFLINE');

    const unauthorized = new DesktopCloudConnectionManager(
      sessions as never,
      runtime as never,
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    await expect(unauthorized.getState(profile('account-1'))).resolves.toBe('REAUTH_REQUIRED');

    const mismatch = new DesktopCloudConnectionManager(
      sessions as never,
      runtime as never,
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            session: { id: 'session-2', expiresAt: '2030-01-01T00:00:00.000Z' },
            user: { id: 'other-account', email: 'other@example.com', name: 'Other' },
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(mismatch.getState(profile('account-1'))).resolves.toBe('REAUTH_REQUIRED');
  });

  it('validates the session without rewriting credentials and enables sync only for the active Profile', async () => {
    const sessions = {
      load: vi.fn().mockResolvedValue(stored),
      save: vi.fn(),
      getValidToken: vi.fn(),
    };
    const runtime = { enableCloudSync: vi.fn(), getActiveProfileId: () => 'profile-1' };
    const manager = new DesktopCloudConnectionManager(
      sessions as never,
      runtime as never,
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            session: { id: 'session-2', expiresAt: '2031-01-01T00:00:00.000Z' },
            user: { id: 'account-1', email: 'user@example.com', name: 'User', emailVerified: true },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(manager.restore(profile('account-1'))).resolves.toBe('ONLINE');
    expect(sessions.save).not.toHaveBeenCalled();
    expect(runtime.enableCloudSync).toHaveBeenCalledOnce();
  });
});
