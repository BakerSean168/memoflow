import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PowerSyncDatabase } from '@powersync/node';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { composeAccount } from './compose-account';

const CLOUD_ACCOUNT_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440000';
const ACCOUNT_PROFILE = JSON.stringify({
  nickname: 'Local Name',
  realName: null,
  avatarUrl: null,
  bio: 'Local bio',
  gender: 'PreferNotToSay',
  birthday: null,
});

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

/**
 * Real PowerSync local database (no repository or SQL fakes). `accounts` is a
 * synced table; the profile-sync outbox/snapshot are local-only tables, which
 * PowerSync exposes as writable views over `ps_data_local__*` storage.
 */
async function createHarness() {
  const root = await mkdtemp(path.join(tmpdir(), 'account-profile-sync-'));
  const db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: path.join(root, 'db.sqlite') },
  });
  await db.init();
  await db.execute(
    `INSERT INTO accounts (id, status, profile, created_at, updated_at, closed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      CLOUD_ACCOUNT_ID,
      'Active',
      ACCOUNT_PROFILE,
      '2026-11-01T00:00:00.000Z',
      '2026-11-01T00:00:00.000Z',
      null,
    ],
  );

  let token: string | null = null;
  const pushCloudProfile = vi.fn().mockResolvedValue(undefined);
  const composed = composeAccount({
    db,
    clock: { now: () => 1_700_000_000_000 } as never,
    userTimeContextPort: {} as never,
    syncOptions: {
      getCloudAccountId: () => CLOUD_ACCOUNT_ID,
      getCloudAccessToken: async () => token,
      pushCloudProfile,
      markAccountClosing: async () => undefined,
      clearAccountClosingMarker: async () => undefined,
      afterCloudAccountClosed: async () => undefined,
    },
  });

  return {
    db,
    sync: composed.profileSync!,
    pushCloudProfile,
    setToken(next: string | null) {
      token = next;
    },
    close: async () => {
      await db.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

describe('DesktopAccountProfileSync on a real PowerSync profile database', () => {
  let harness: Awaited<ReturnType<typeof createHarness>>;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('commits the local profile and sync intent while the cloud is unreachable', async () => {
    const result = await harness.sync.update(
      { nickname: 'Offline Name' },
      ipcContext(CLOUD_ACCOUNT_ID),
    );

    expect(result.ok).toBe(true);
    const account = await harness.db.get<{ profile: string }>(
      'SELECT profile FROM accounts WHERE id = ?',
      [CLOUD_ACCOUNT_ID],
    );
    expect(JSON.parse(account.profile).nickname).toBe('Offline Name');
    await expect(
      harness.db.getAll('SELECT id, owner_id, revision FROM account_profile_sync_outbox'),
    ).resolves.toEqual([{ id: 'current', owner_id: CLOUD_ACCOUNT_ID, revision: 1 }]);
    expect(harness.pushCloudProfile).not.toHaveBeenCalled();
  });

  it('coalesces repeated edits into one outbox row with an incremented revision', async () => {
    await harness.sync.update({ nickname: 'First Name' }, ipcContext(CLOUD_ACCOUNT_ID));
    await harness.sync.update({ nickname: 'Second Name' }, ipcContext(CLOUD_ACCOUNT_ID));

    await expect(
      harness.db.getAll('SELECT id, owner_id, revision FROM account_profile_sync_outbox'),
    ).resolves.toEqual([{ id: 'current', owner_id: CLOUD_ACCOUNT_ID, revision: 2 }]);
  });

  it('records the delivered snapshot and clears the outbox after a successful flush', async () => {
    await harness.sync.update({ nickname: 'Online Name' }, ipcContext(CLOUD_ACCOUNT_ID));
    harness.setToken('session-token');

    await expect(harness.sync.flush()).resolves.toBe(true);

    expect(harness.pushCloudProfile).toHaveBeenCalledWith('session-token', {
      nickname: 'Online Name',
      avatar: null,
      bio: 'Local bio',
    });
    await expect(harness.db.getAll('SELECT * FROM account_profile_sync_outbox')).resolves.toEqual(
      [],
    );
    await expect(
      harness.db.get<{ nickname: string; synced_at: number }>(
        'SELECT nickname, synced_at FROM account_profile_sync_snapshot WHERE id = ?',
        ['current'],
      ),
    ).resolves.toMatchObject({ nickname: 'Online Name', synced_at: expect.any(Number) });
  });
});
