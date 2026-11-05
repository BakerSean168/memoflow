import { computed, inject, ref, watch, type Ref } from 'vue';
import { accountUiHost } from '../../account-ui-host';
import type { DesktopAccessSnapshot } from '@memoflow/desktop-contracts';
import { useAccountStore } from '../stores/account-store';
import { processAvatarFile } from './avatar-image';
import type { AccountAvatarStore } from './account-avatar-store';

/**
 * Bumped after a successful save so every mounted surface re-reads the same
 * account avatar without a global event bus. Issue #858.
 */
const avatarRevision = ref(0);

/** Exposed for tests that need to reset the shared revision between cases. */
export function resetAccountAvatarRevisionForTests(): void {
  avatarRevision.value = 0;
}

/**
 * Resolve the current account's local avatar and expose the upload action.
 *
 * The local file always wins; `fallbackUrl` is the one-time compatibility read
 * for legacy URL avatars stored before Issue #858.
 */
export function useAccountAvatar(fallbackUrl?: () => string | null) {
  const host = accountUiHost;
  const store = host ? inject(host.ACCOUNT_AVATAR_STORE_KEY, null) : null;
  const snapshot = host
    ? inject<Ref<DesktopAccessSnapshot | null>>(host.DESKTOP_ACCESS_SNAPSHOT_KEY, ref(null))
    : ref<DesktopAccessSnapshot | null>(null);
  const accountStore = useAccountStore();

  const accountKey = computed(
    () => snapshot.value?.profile?.profileId ?? accountStore.currentAccount?.id ?? null,
  );
  const localUrl = ref<string | null>(null);
  const isUploading = ref(false);

  async function refresh(): Promise<void> {
    if (!store) return;
    try {
      localUrl.value = await store.load(accountKey.value);
    } catch {
      localUrl.value = null;
    }
  }

  const avatarUrl = computed(() => localUrl.value ?? fallbackUrl?.() ?? null);

  async function upload(file: Blob): Promise<string | null> {
    if (!store) throw new Error('AVATAR_STORE_UNAVAILABLE');
    isUploading.value = true;
    try {
      const png = await processAvatarFile(file);
      const url = await store.save(accountKey.value, png);
      localUrl.value = url;
      avatarRevision.value += 1;
      return url;
    } finally {
      isUploading.value = false;
    }
  }

  // The shared revision changes after a save on any surface; the account key
  // changes on Profile switch. Both invalidate this instance's cached read.
  watch([accountKey, avatarRevision], () => void refresh(), { immediate: true });

  return {
    avatarUrl,
    localUrl,
    isUploading,
    hasStore: store !== null,
    accountKey,
    refresh,
    upload,
  };
}

export { avatarRevision };
