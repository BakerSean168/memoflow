import { describe, expect, it } from 'vitest';
import {
  dataUrlToPngBlob,
  planCloudAvatarSync,
  readCloudAvatarSyncState,
  writeCloudAvatarSyncState,
  type AvatarSyncStorage,
  type CloudAvatarSyncPlanInput,
} from './cloud-avatar-sync';

function plan(overrides: Partial<CloudAvatarSyncPlanInput>) {
  return planCloudAvatarSync({
    isCloudAccount: true,
    pending: false,
    serverUpdatedAt: 1_000,
    lastSyncedAt: null,
    ...overrides,
  });
}

describe('planCloudAvatarSync', () => {
  it('never syncs local accounts', () => {
    expect(plan({ isCloudAccount: false, pending: true, serverUpdatedAt: 2_000 })).toBe('none');
    expect(plan({ isCloudAccount: false, lastSyncedAt: 1 })).toBe('none');
  });

  it('pushes a pending local edit before considering the server copy', () => {
    expect(plan({ pending: true, serverUpdatedAt: 2_000, lastSyncedAt: 1_000 })).toBe('upload');
    expect(plan({ pending: true, serverUpdatedAt: null })).toBe('upload');
  });

  it('pulls the first cloud avatar when this device has never synced', () => {
    expect(plan({ serverUpdatedAt: 1_000, lastSyncedAt: null })).toBe('download');
  });

  it('pulls only when the server timestamp is newer (last-write-wins)', () => {
    expect(plan({ serverUpdatedAt: 2_000, lastSyncedAt: 1_000 })).toBe('download');
    expect(plan({ serverUpdatedAt: 1_000, lastSyncedAt: 1_000 })).toBe('none');
    expect(plan({ serverUpdatedAt: 999, lastSyncedAt: 1_000 })).toBe('none');
  });

  it('does nothing when the server has no avatar', () => {
    expect(plan({ serverUpdatedAt: null, lastSyncedAt: 1_000 })).toBe('none');
  });
});

function memoryStorage(): AvatarSyncStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe('cloud avatar sync state', () => {
  it('round-trips the pending flag and timestamp per account', () => {
    const storage = memoryStorage();
    writeCloudAvatarSyncState('account-a', { lastSyncedAt: 42, pending: true }, storage);
    writeCloudAvatarSyncState('account-b', { lastSyncedAt: null, pending: false }, storage);

    expect(readCloudAvatarSyncState('account-a', storage)).toEqual({
      lastSyncedAt: 42,
      pending: true,
    });
    expect(readCloudAvatarSyncState('account-b', storage)).toEqual({
      lastSyncedAt: null,
      pending: false,
    });
  });

  it('treats malformed storage as never synced', () => {
    const storage = memoryStorage();
    storage.setItem('memoflow:account-avatar-sync:account-a', '{not-json');
    expect(readCloudAvatarSyncState('account-a', storage)).toEqual({
      lastSyncedAt: null,
      pending: false,
    });
  });
});

describe('dataUrlToPngBlob', () => {
  it('converts a PNG data URL back into a typed blob', async () => {
    const dataUrl = 'data:image/png;base64,AQIDBA==';
    const blob = dataUrlToPngBlob(dataUrl);
    expect(blob).not.toBeNull();
    expect(blob?.type).toBe('image/png');
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('rejects non-PNG payloads', () => {
    expect(dataUrlToPngBlob('data:image/jpeg;base64,AQID')).toBeNull();
    expect(dataUrlToPngBlob('not-a-data-url')).toBeNull();
  });
});
