import { describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type { AccountClientDTO } from '@memoflow/account-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';
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
  snapshot?: {
    owner_id: string;
    nickname: string | null;
    bio: string | null;
    avatar_url: string | null;
    synced_at: number | null;
  } | null;
}) {
  let token = options?.token ?? null;
  let pending = options?.pending ?? null;
  let snapshot = options?.snapshot ?? null;
  let profile = {
    nickname: 'Local Name',
    avatarUrl: 'https://example.com/avatar.png',
    bio: 'Local bio',
  };
  const applySql = async (
    sql: string,
    parameters: unknown[] = [],
  ): Promise<{ rowsAffected: number }> => {
    if (sql.includes('account_profile_sync_snapshot')) {
      if (sql.includes('INSERT OR IGNORE')) {
        snapshot ??= {
          owner_id: String(parameters[0]),
          nickname: parameters[1] as string | null,
          bio: parameters[2] as string | null,
          avatar_url: parameters[3] as string | null,
          synced_at: null,
        };
      } else {
        snapshot = {
          owner_id: String(parameters[0]),
          nickname: parameters[1] as string | null,
          bio: parameters[2] as string | null,
          avatar_url: parameters[3] as string | null,
          synced_at: parameters[4] as number,
        };
      }
    }
    if (
      sql.includes('account_profile_sync_outbox') &&
      sql.trimStart().toUpperCase().startsWith('INSERT')
    ) {
      pending = {
        owner_id: String(parameters[0]),
        revision: (pending?.revision ?? 0) + 1,
      };
    }
    if (sql.includes('DELETE FROM account_profile_sync_outbox')) pending = null;
    return { rowsAffected: 1 };
  };
  const txExecute = vi.fn(applySql);
  const dbExecute = vi.fn(applySql);
  const tx = { execute: txExecute };
  const db = {
    writeTransaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
    getOptional: vi.fn(async (sql: string) => {
      if (sql.includes('account_profile_sync_snapshot')) return snapshot;
      if (sql.includes('account_profile_sync_outbox')) return pending;
      return null;
    }),
    execute: dbExecute,
  };
  const updateProfileUseCase = {
    execute: vi.fn(async (input: { nickname?: string; bio?: string | null }) => {
      profile = {
        ...profile,
        ...(input.nickname === undefined ? {} : { nickname: input.nickname }),
        ...(input.bio === undefined ? {} : { bio: input.bio || '' }),
      };
      return ok({ ...ACCOUNT, profile });
    }),
  };
  const repository = {
    findById: vi.fn(async () => ({ profile })),
  };
  const pushCloudProfile = vi.fn().mockResolvedValue(undefined);
  const updateLocalProfileMetadata = vi.fn().mockResolvedValue(undefined);
  const sync = new DesktopAccountProfileSync(
    db as never,
    repository as never,
    updateProfileUseCase as never,
    {
      getCloudAccountId: () => options?.cloudAccountId ?? null,
      getCloudAccessToken: async () => token,
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
    get snapshot() {
      return snapshot;
    },
    get pending() {
      return pending;
    },
    setToken(next: string | null) {
      token = next;
    },
    setPending(next: { owner_id: string; revision: number } | null) {
      pending = next;
    },
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

  it('keeps the committed local update when post-commit metadata fails', async () => {
    const harness = createHarness({ cloudAccountId: 'cloud-1' });
    harness.updateLocalProfileMetadata.mockRejectedValueOnce(new Error('metadata unavailable'));

    const result = await harness.sync.update({ nickname: 'Committed Name' }, ipcContext('cloud-1'));

    expect(result.ok).toBe(true);
    expect(harness.updateProfileUseCase.execute).toHaveBeenCalledOnce();
    expect(harness.tx.execute).toHaveBeenCalledWith(
      expect.stringContaining('account_profile_sync_outbox'),
      ['cloud-1', expect.any(Number)],
    );
    expect(harness.updateLocalProfileMetadata).toHaveBeenCalledWith({ nickname: 'Committed Name' });
  });

  it('saves locally while offline and delivers the retained intent after recovery', async () => {
    const harness = createHarness({ cloudAccountId: 'cloud-1' });

    const saved = await harness.sync.update({ nickname: 'Offline Name' }, ipcContext('cloud-1'));

    expect(saved.ok).toBe(true);
    expect(harness.tx.execute).toHaveBeenCalledWith(
      expect.stringContaining('account_profile_sync_outbox'),
      ['cloud-1', expect.any(Number)],
    );

    // Still offline: no token, so delivery cannot happen and the outbox row stays.
    await expect(harness.sync.flush()).resolves.toBe(false);
    expect(harness.pushCloudProfile).not.toHaveBeenCalled();
    expect(harness.db.execute).not.toHaveBeenCalled();

    // Connection restored: the retained intent is delivered and cleared.
    harness.setToken('session-token');
    harness.setPending({ owner_id: 'cloud-1', revision: 2 });

    await expect(harness.sync.flush()).resolves.toBe(true);

    expect(harness.pushCloudProfile).toHaveBeenCalledWith('session-token', {
      nickname: 'Offline Name',
      avatar: 'https://example.com/avatar.png',
      bio: 'Local bio',
    });
    expect(harness.db.execute).toHaveBeenCalledWith(expect.stringContaining('revision = ?'), [2]);
  });

  it('keeps the save result and outbox when the post-save flush fails', async () => {
    const harness = createHarness({
      cloudAccountId: 'cloud-1',
      token: 'session-token',
      pending: { owner_id: 'cloud-1', revision: 1 },
    });
    harness.pushCloudProfile.mockRejectedValueOnce(new Error('offline'));

    const result = await harness.sync.update({ nickname: 'Offline Name' }, ipcContext('cloud-1'));

    expect(result.ok).toBe(true);
    await vi.waitFor(() => expect(harness.pushCloudProfile).toHaveBeenCalledOnce());
    expect(harness.db.execute).not.toHaveBeenCalled();
  });

  it('reports a missing local account row as a failed result, not a thrown error', async () => {
    const harness = createHarness({ cloudAccountId: 'cloud-1' });
    harness.updateProfileUseCase.execute.mockResolvedValueOnce(
      fail({ code: 'NOT_FOUND', message: 'Account not found: cloud-1' }),
    );

    const result = await harness.sync.update({ nickname: 'Ghost' }, ipcContext('cloud-1'));

    expect(result.ok).toBe(false);
    expect(harness.tx.execute).not.toHaveBeenCalled();
    expect(harness.updateLocalProfileMetadata).not.toHaveBeenCalled();
  });

  it('reports a field-level diff against the last delivered profile', async () => {
    const harness = createHarness({
      cloudAccountId: 'cloud-1',
      token: 'session-token',
      snapshot: {
        owner_id: 'cloud-1',
        nickname: 'Local Name',
        bio: 'Local bio',
        avatar_url: 'https://example.com/avatar.png',
        synced_at: 1_700_000_000_000,
      },
    });

    await harness.sync.update(
      { nickname: 'Next Name', bio: 'A changed bio' },
      ipcContext('cloud-1'),
    );

    await expect(harness.sync.getState()).resolves.toEqual({
      pending: true,
      revision: 1,
      lastSyncedAt: 1_700_000_000_000,
      fields: [
        { field: 'nickname', value: 'Next Name' },
        { field: 'bio', value: 'A changed bio' },
      ],
      failureCategory: null,
    });
  });

  it('records a pre-edit baseline when the first change has no delivered snapshot yet', async () => {
    const harness = createHarness({ cloudAccountId: 'cloud-1' });

    await harness.sync.update({ nickname: 'Next Name' }, ipcContext('cloud-1'));

    expect(harness.tx.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO account_profile_sync_snapshot'),
      ['cloud-1', 'Local Name', 'Local bio', 'https://example.com/avatar.png'],
    );
    await expect(harness.sync.getState()).resolves.toMatchObject({
      pending: true,
      lastSyncedAt: null,
      fields: [{ field: 'nickname', value: 'Next Name' }],
    });
  });

  it('refreshes the last delivered snapshot only after a successful flush', async () => {
    const harness = createHarness({
      cloudAccountId: 'cloud-1',
      token: 'session-token',
      pending: { owner_id: 'cloud-1', revision: 2 },
    });
    await harness.sync.update({ nickname: 'Next Name' }, ipcContext('cloud-1'));

    await expect(harness.sync.flush()).resolves.toBe(true);

    expect(harness.snapshot).toMatchObject({
      owner_id: 'cloud-1',
      nickname: 'Next Name',
      synced_at: expect.any(Number),
    });
    await expect(harness.sync.getState()).resolves.toMatchObject({
      pending: false,
      fields: [],
      failureCategory: null,
    });
  });

  it('keeps a sanitized failure category when the cloud rejects the profile', async () => {
    const harness = createHarness({
      cloudAccountId: 'cloud-1',
      token: 'session-token',
      pending: { owner_id: 'cloud-1', revision: 1 },
    });
    harness.pushCloudProfile.mockRejectedValueOnce(
      Object.assign(new Error('unauthorized secret-token'), { statusCode: 401 }),
    );

    await expect(harness.sync.flush()).rejects.toThrow('unauthorized secret-token');

    await expect(harness.sync.getState()).resolves.toMatchObject({
      pending: true,
      failureCategory: 'authorization',
    });
  });
});
