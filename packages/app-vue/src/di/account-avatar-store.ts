import type { IResultIpcClient } from '@memoflow/ipc-client';
import { ProfileAvatarChannels } from '@memoflow/desktop-contracts';
import { blobToDataUrl, type AccountAvatarStore } from '@memoflow/account-ui';

const WEB_STORAGE_PREFIX = 'memoflow:account-avatar:';

/**
 * Desktop avatar persistence: the main process owns the file inside the active
 * Profile's data directory. The renderer only sees the normalized data URL.
 */
export function createDesktopAccountAvatarStore(ipc: IResultIpcClient): AccountAvatarStore {
  return {
    async load() {
      const result = await ipc.invoke<string | null>(ProfileAvatarChannels.LOAD);
      if (!result.ok) return null;
      return result.data;
    },
    async save(_accountKey, image) {
      const dataUrl = await blobToDataUrl(image);
      const result = await ipc.invoke<string>(ProfileAvatarChannels.SAVE, dataUrl);
      // The uploader maps any non-AvatarImageError to its own localized
      // failure toast, so a stable code is enough; a raw main-process message
      // must not cross into presentation code.
      if (!result.ok) throw new Error('AVATAR_SAVE_FAILED');
      return result.data;
    },
  };
}

/**
 * Web avatar persistence: the browser has no Profile data directory, so the
 * same normalized PNG is stored per account in browser storage.
 */
export function createWebAccountAvatarStore(
  storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
): AccountAvatarStore {
  function keyFor(accountKey: string | null): string {
    return `${WEB_STORAGE_PREFIX}${accountKey ?? 'anonymous'}`;
  }
  return {
    async load(accountKey) {
      return storage?.getItem(keyFor(accountKey)) ?? null;
    },
    async save(accountKey, image) {
      if (!storage) throw new Error('AVATAR_STORAGE_UNAVAILABLE');
      const dataUrl = await blobToDataUrl(image);
      storage.setItem(keyFor(accountKey), dataUrl);
      return dataUrl;
    },
  };
}
