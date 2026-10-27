import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { AccountClientDTO } from '@memoflow/account-contracts';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { DesktopAccountProfileSync } from './desktop-account-profile-sync';

function ipcContext(identityId: string): ExecutionContext {
  return {
    requestId: `req-profile-${identityId}`,
    traceId: `req-profile-${identityId}`,
    startedAt: 1_700_000_000_000,
    source: 'ipc',
    identityId,
    deviceId: 'desktop-app',
  };
}

const ACCOUNT = {
  id: 'cloud-1',
  profile: {
    nickname: 'Local Name',
    avatarUrl: 'https://example.com/avatar.png',
    bio: 'Local bio',
  },
} as unknown as AccountClientDTO;

function createHarness(options?: {
  cloudAccountId?: string | null;
  token?: string | null;
  pending?: { owner_id: string; revision: number } | null;
}) {
  const execute = vi.fn().mockResolvedValue({ rowsAffected: 1 });
  const tx = { execute };
  const db = {
    writeTransaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
    getOptional: vi.fn().mockResolvedValue(options?.pending ?? null),
    execute: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  };
  const updateProfileUseCase = {
    execute: vi.fn().mockResolvedValue(ok(ACCOUNT)),
  };
  const repository = {
    findById: vi.fn().mockResolvedValue({
      profile: {
        nickname: 'Local Name',
        avatarUrl: 'https://example.com/avatar.png',
        bio: 'Local bio',
      },
    }),
  };
  const pushCloudProfile = vi.fn().mockResolvedValue(undefined);
  const updateLocalProfileMetadata = vi.fn().mockResolvedValue(undefined);
  const sync = new DesktopAccountProfileSync(
    db as never,
    repository as never,
    updateProfileUseCase as never,
    {
      getCloudAccountId: () => options?.cloudAccountId ?? null,
      getCloudAccessToken: async () => options?.token ?? null,
      pushCloudProfile,
      updateLocalProfileMetadata,
    },
  );

  return {
    sync,
    db,
    tx,
    updateProfileUseCase,
    repository,
    pushCloudProfile,
    updateLocalProfileMetadata,
  };
}

describe('DesktopAccountProfileSync', () => {
  it('updates a guest locally without creating cloud sync intent', async () => {
    const harness = createHarness();

    const result = await harness.sync.update({ nickname: 'Guest Name' }, ipcContext('guest-1'));

    expect(result.ok).toBe(true);
    expect(harness.updateProfileUseCase.execute).toHaveBeenCalledWith(
      { nickname: 'Guest Name' },
      expect.objectContaining({ identityId: 'guest-1', source: 'ipc' }),
      harness.tx,
    );
    expect(harness.tx.execute).not.toHaveBeenCalled();
    expect(harness.updateLocalProfileMetadata).toHaveBeenCalledWith({ nickname: 'Guest Name' });
  });

  it('commits a registered local update and coalesced sync intent together', async () => {
    const harness = createHarness({ cloudAccountId: 'cloud-1' });

    const result = await harness.sync.update({ nickname: 'Next Name' }, ipcContext('cloud-1'));

    expect(result.ok).toBe(true);
    expect(harness.tx.execute).toHaveBeenCalledWith(
      expect.stringContaining('account_profile_sync_outbox'),
      ['cloud-1', expect.any(Number)],
    );
  });

  it('keeps pending intent while offline', async () => {
    const harness = createHarness({
      cloudAccountId: 'cloud-1',
      pending: { owner_id: 'cloud-1', revision: 3 },
    });

    await expect(harness.sync.flush()).resolves.toBe(false);

    expect(harness.pushCloudProfile).not.toHaveBeenCalled();
    expect(harness.db.execute).not.toHaveBeenCalled();
  });

  it('pushes the latest local projection and only clears the delivered revision', async () => {
    const harness = createHarness({
      cloudAccountId: 'cloud-1',
      token: 'session-token',
      pending: { owner_id: 'cloud-1', revision: 4 },
    });

    await expect(harness.sync.flush()).resolves.toBe(true);

    expect(harness.pushCloudProfile).toHaveBeenCalledWith('session-token', {
      nickname: 'Local Name',
      avatar: 'https://example.com/avatar.png',
      bio: 'Local bio',
    });
    expect(harness.db.execute).toHaveBeenCalledWith(expect.stringContaining('revision = ?'), [4]);
  });

  it('preserves the outbox when cloud delivery fails', async () => {
    const harness = createHarness({
      cloudAccountId: 'cloud-1',
      token: 'session-token',
      pending: { owner_id: 'cloud-1', revision: 1 },
    });
    harness.pushCloudProfile.mockRejectedValueOnce(new Error('offline'));

    await expect(harness.sync.flush()).rejects.toThrow('offline');

    expect(harness.db.execute).not.toHaveBeenCalled();
  });
});
