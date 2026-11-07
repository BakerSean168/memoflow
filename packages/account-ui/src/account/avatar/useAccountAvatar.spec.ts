import { createApp, effectScope, nextTick, ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountClientPort } from '@memoflow/account-client';
import { fail, ok } from '@memoflow/transport-contracts/result';
import {
  ACCOUNT_AVATAR_STORE_KEY,
  ACCOUNT_SERVICE_KEY,
  AUTH_SERVICE_KEY,
  DESKTOP_ACCESS_SNAPSHOT_KEY,
  DESKTOP_BRIDGE_KEY,
  EXTERNAL_AGENT_SERVICE_KEY,
  LOGOUT_HANDLER_KEY,
  PROFILE_EDITOR_INTENT_KEY,
} from '@account-ui-test-host/di/keys';
import { bindAccountUiHost, type AccountUiHost } from '../../account-ui-host';
import { useAccountStore } from '../stores/account-store';
import { useAccountAvatar } from './useAccountAvatar';
import { toast } from 'vue-sonner';

vi.mock('vue-sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('./avatar-image', () => ({
  processAvatarFile: vi.fn(
    async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
  ),
}));

const SYNC_KEY = 'memoflow:account-avatar-sync:cloud-1';

function createService() {
  return {
    getMyProfile: vi.fn(),
    updateMyProfile: vi.fn(),
    closeAccount: vi.fn(),
    getMyAvatarMeta: vi.fn(),
    downloadMyAvatar: vi.fn(),
    uploadMyAvatar: vi.fn(),
  } as unknown as AccountClientPort;
}

function mountAvatar(service: AccountClientPort, store: { load: unknown; save: unknown }) {
  let avatar!: ReturnType<typeof useAccountAvatar>;
  const snapshot = ref(null);
  const pinia = createPinia();
  setActivePinia(pinia);
  useAccountStore().setCurrentAccount({
    id: 'cloud-1',
    status: 'Active',
    profile: {
      nickname: 'Cloud User',
      realName: null,
      avatarUrl: null,
      bio: null,
      gender: 'PreferNotToSay',
      birthday: null,
    },
    createdAt: 1,
    updatedAt: 1,
    closedAt: null,
  });
  bindAccountUiHost({
    ACCOUNT_SERVICE_KEY,
    AUTH_SERVICE_KEY,
    EXTERNAL_AGENT_SERVICE_KEY,
    DESKTOP_ACCESS_SNAPSHOT_KEY,
    DESKTOP_BRIDGE_KEY,
    ACCOUNT_AVATAR_STORE_KEY,
    PROFILE_EDITOR_INTENT_KEY,
    LOGOUT_HANDLER_KEY,
    components: {},
  } as unknown as AccountUiHost);

  const app = createApp({ render: () => null });
  app.use(pinia);
  app.provide(ACCOUNT_SERVICE_KEY as symbol, service);
  app.provide(ACCOUNT_AVATAR_STORE_KEY as symbol, store);
  app.provide(DESKTOP_ACCESS_SNAPSHOT_KEY as symbol, snapshot);
  const scope = effectScope();
  scope.run(() => {
    avatar = app.runWithContext(() => useAccountAvatar());
  });
  return { avatar, stop: () => scope.stop() };
}

async function settle(): Promise<void> {
  await flushPromises();
  await nextTick();
  await flushPromises();
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  useAccountStore().setCurrentAccount({
    id: 'cloud-1',
    status: 'Active',
    profile: {
      nickname: 'Cloud User',
      realName: null,
      avatarUrl: null,
      bio: null,
      gender: 'PreferNotToSay',
      birthday: null,
    },
    createdAt: 1,
    updatedAt: 1,
    closedAt: null,
  });
});

describe('useAccountAvatar cloud sync (Issue #859)', () => {
  it('pulls a newer cloud avatar onto a fresh device and caches it locally', async () => {
    const service = createService();
    let cached: string | null = null;
    const store = {
      load: vi.fn(async () => cached),
      save: vi.fn(async () => {
        cached = 'data:image/png;base64,bmV3';
        return cached;
      }),
    };
    vi.mocked(service.getMyAvatarMeta).mockResolvedValue(ok({ updatedAt: 5_000 }));
    vi.mocked(service.downloadMyAvatar).mockResolvedValue(
      ok({ dataUrl: 'data:image/png;base64,AQID', updatedAt: 5_000 }),
    );

    const { avatar, stop } = mountAvatar(service, store);
    await settle();

    expect(service.downloadMyAvatar).toHaveBeenCalledOnce();
    expect(store.save).toHaveBeenCalledWith('cloud-1', expect.any(Blob));
    expect(avatar.avatarUrl.value).toBe('data:image/png;base64,bmV3');
    expect(JSON.parse(localStorage.getItem(SYNC_KEY)!)).toEqual({
      lastSyncedAt: 5_000,
      pending: false,
    });
    stop();
  });

  it('does not re-download when the local sync timestamp is current', async () => {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ lastSyncedAt: 5_000, pending: false }));
    const service = createService();
    const store = {
      load: vi.fn(async () => 'data:image/png;base64,bG9jYWw='),
      save: vi.fn(),
    };
    vi.mocked(service.getMyAvatarMeta).mockResolvedValue(ok({ updatedAt: 5_000 }));

    const { avatar, stop } = mountAvatar(service, store);
    await settle();

    expect(service.downloadMyAvatar).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
    expect(avatar.avatarUrl.value).toBe('data:image/png;base64,bG9jYWw=');
    stop();
  });

  it('uploads after a local save and records the server timestamp', async () => {
    const service = createService();
    let cached: string | null = null;
    const store = {
      load: vi.fn(async () => cached),
      save: vi.fn(async () => {
        cached = 'data:image/png;base64,bmV3';
        return cached;
      }),
    };
    vi.mocked(service.getMyAvatarMeta).mockResolvedValue(ok({ updatedAt: null }));
    vi.mocked(service.uploadMyAvatar).mockResolvedValue(ok({ updatedAt: 9_000 }));

    const { avatar, stop } = mountAvatar(service, store);
    await settle();
    await avatar.upload(new Blob([new Uint8Array([1])], { type: 'image/png' }));
    await settle();

    expect(service.uploadMyAvatar).toHaveBeenCalledWith({ dataUrl: 'data:image/png;base64,bmV3' });
    expect(JSON.parse(localStorage.getItem(SYNC_KEY)!)).toEqual({
      lastSyncedAt: 9_000,
      pending: false,
    });
    stop();
  });

  it('keeps the local avatar and marks a pending retry when upload fails', async () => {
    const service = createService();
    let cached: string | null = null;
    const store = {
      load: vi.fn(async () => cached),
      save: vi.fn(async () => {
        cached = 'data:image/png;base64,bmV3';
        return cached;
      }),
    };
    vi.mocked(service.getMyAvatarMeta).mockResolvedValue(ok({ updatedAt: null }));
    vi.mocked(service.uploadMyAvatar).mockResolvedValue(
      fail({ code: 'SERVICE_UNAVAILABLE', message: 'offline' }),
    );

    const { avatar, stop } = mountAvatar(service, store);
    await settle();
    const url = await avatar.upload(new Blob([new Uint8Array([1])], { type: 'image/png' }));
    await settle();

    expect(url).toBe('data:image/png;base64,bmV3');
    expect(avatar.localUrl.value).toBe('data:image/png;base64,bmV3');
    expect(avatar.cloudSyncFailed.value).toBe(1);
    expect(JSON.parse(localStorage.getItem(SYNC_KEY)!)).toEqual({
      lastSyncedAt: null,
      pending: true,
    });
    stop();
  });

  it('retries a pending upload on the next entry instead of pulling the cloud copy', async () => {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ lastSyncedAt: null, pending: true }));
    const service = createService();
    const store = {
      load: vi.fn(async () => 'data:image/png;base64,bG9jYWw='),
      save: vi.fn(),
    };
    vi.mocked(service.getMyAvatarMeta).mockResolvedValue(ok({ updatedAt: 8_000 }));
    vi.mocked(service.uploadMyAvatar).mockResolvedValue(ok({ updatedAt: 8_100 }));

    const { stop } = mountAvatar(service, store);
    await settle();

    expect(service.uploadMyAvatar).toHaveBeenCalledWith({
      dataUrl: 'data:image/png;base64,bG9jYWw=',
    });
    expect(service.downloadMyAvatar).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(SYNC_KEY)!)).toEqual({
      lastSyncedAt: 8_100,
      pending: false,
    });
    stop();
  });

  it('records and surfaces a one-time notice when a newer cloud avatar replaces a known local copy', async () => {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ lastSyncedAt: 5_000, pending: false }));
    const service = createService();
    let cached: string | null = 'data:image/png;base64,b2xk';
    const store = {
      load: vi.fn(async () => cached),
      save: vi.fn(async () => {
        cached = 'data:image/png;base64,bmV3';
        return cached;
      }),
    };
    vi.mocked(service.getMyAvatarMeta).mockResolvedValue(ok({ updatedAt: 9_000 }));
    vi.mocked(service.downloadMyAvatar).mockResolvedValue(
      ok({ dataUrl: 'data:image/png;base64,AQID', updatedAt: 9_000 }),
    );
    vi.mocked(toast.info).mockClear();

    const { avatar, stop } = mountAvatar(service, store);
    await settle();

    expect(avatar.cloudAlignedAt.value).toEqual(expect.any(Number));
    expect(avatar.avatarUrl.value).toBe('data:image/png;base64,bmV3');
    expect(toast.info).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem(SYNC_KEY)!)).toMatchObject({
      lastSyncedAt: 9_000,
      pending: false,
      lastAlignedAt: expect.any(Number),
    });

    avatar.dismissCloudAlignment();
    expect(avatar.cloudAlignedAt.value).toBeNull();
    expect(JSON.parse(localStorage.getItem(SYNC_KEY)!).lastAlignedAt).toBeUndefined();
    stop();
  });

  it('does not claim an overwrite on the first cloud pull of a fresh device', async () => {
    const service = createService();
    const store = {
      load: vi.fn(async () => null),
      save: vi.fn(async () => 'data:image/png;base64,bmV3'),
    };
    vi.mocked(service.getMyAvatarMeta).mockResolvedValue(ok({ updatedAt: 9_000 }));
    vi.mocked(service.downloadMyAvatar).mockResolvedValue(
      ok({ dataUrl: 'data:image/png;base64,AQID', updatedAt: 9_000 }),
    );
    vi.mocked(toast.info).mockClear();

    const { avatar, stop } = mountAvatar(service, store);
    await settle();

    expect(avatar.cloudAlignedAt.value).toBeNull();
    expect(toast.info).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(SYNC_KEY)!)).toEqual({
      lastSyncedAt: 9_000,
      pending: false,
    });
    stop();
  });
});
