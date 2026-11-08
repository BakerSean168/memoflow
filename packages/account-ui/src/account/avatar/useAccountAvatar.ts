import { computed, inject, onScopeDispose, ref, watch, type Ref } from 'vue';
import { toast } from 'vue-sonner';
import { accountUiHost } from '../../account-ui-host';
import type { DesktopAccessSnapshot } from '@memoflow/desktop-contracts';
import type { AccountClientPort } from '@memoflow/account-client';
import { useAccountStore } from '../stores/account-store';
import { processAvatarFile } from './avatar-image';
import {
  dataUrlToPngBlob,
  planCloudAvatarSync,
  readCloudAvatarSyncState,
  registerCloudAvatarRetry,
  writeCloudAvatarSyncState,
} from './cloud-avatar-sync';

/**
 * Bumped after a successful save so every mounted surface re-reads the same
 * account avatar without a global event bus. Issue #858.
 */
const avatarRevision = ref(0);

/**
 * Resolve the current account's local avatar and expose the upload action.
 *
 * The local file always wins; `fallbackUrl` is the one-time compatibility read
 * for legacy URL avatars stored before Issue #858.
 *
 * Issue #859: cloud-bound accounts additionally reconcile with the server.
 * Uploads happen in the background after the local write succeeds; failures
 * mark a pending flag and retry on the next mount or `online` event. A pull
 * replaces the local cache only when the server timestamp is newer
 * (last-write-wins, no merge). Local accounts never call these endpoints.
 */
export function useAccountAvatar(fallbackUrl?: () => string | null) {
  const host = accountUiHost;
  const store = host ? inject(host.ACCOUNT_AVATAR_STORE_KEY, null) : null;
  const accountService = host
    ? inject<AccountClientPort | null>(host.ACCOUNT_SERVICE_KEY, null)
    : null;
  const snapshot = host
    ? inject<Ref<DesktopAccessSnapshot | null>>(host.DESKTOP_ACCESS_SNAPSHOT_KEY, ref(null))
    : ref<DesktopAccessSnapshot | null>(null);
  const accountStore = useAccountStore();

  const accountKey = computed(
    () => snapshot.value?.profile?.profileId ?? accountStore.currentAccount?.id ?? null,
  );

  /**
   * Cloud identity for the active account. Desktop exposes it on the Profile
   * snapshot; the web shell has no desktop snapshot and is always cloud-backed.
   */
  const cloudAccountKey = computed(() => {
    const profile = snapshot.value?.profile;
    if (profile) return profile.cloudAccountId ?? null;
    return accountStore.currentAccount?.id ?? null;
  });
  const isCloudAccount = computed(() => cloudAccountKey.value !== null);

  const localUrl = ref<string | null>(null);
  const isUploading = ref(false);
  /** Incremented on every background cloud-sync failure (short-lived toast hook). */
  const cloudSyncFailed = ref(0);
  /** True while the local avatar still needs to reach the cloud (Issue #874). */
  const cloudSyncPending = ref(false);
  /** Last cloud-newer download that replaced this device's cached avatar. */
  const cloudAlignedAt = ref<number | null>(null);

  function readSyncFlags(): void {
    const key = cloudAccountKey.value;
    if (!key) {
      cloudSyncPending.value = false;
      cloudAlignedAt.value = null;
      return;
    }
    const state = readCloudAvatarSyncState(key);
    cloudSyncPending.value = state.pending;
    cloudAlignedAt.value = state.lastAlignedAt ?? null;
  }

  /** Dismiss the "aligned with a newer cloud copy" record after it was seen. */
  function dismissCloudAlignment(): void {
    const key = cloudAccountKey.value;
    if (!key) return;
    const current = readCloudAvatarSyncState(key);
    writeCloudAvatarSyncState(key, {
      lastSyncedAt: current.lastSyncedAt,
      pending: current.pending,
    });
    cloudAlignedAt.value = null;
  }

  async function loadLocal(): Promise<void> {
    if (!store) return;
    try {
      localUrl.value = await store.load(accountKey.value);
    } catch {
      localUrl.value = null;
    }
  }

  async function pushCloudAvatar(dataUrl: string): Promise<void> {
    const key = cloudAccountKey.value;
    if (!accountService || !key) return;
    const markPending = () => {
      const current = readCloudAvatarSyncState(key);
      writeCloudAvatarSyncState(key, { lastSyncedAt: current.lastSyncedAt, pending: true });
      cloudSyncPending.value = true;
      cloudSyncFailed.value += 1;
    };
    let result: Awaited<ReturnType<AccountClientPort['uploadMyAvatar']>>;
    try {
      result = await accountService.uploadMyAvatar({ dataUrl });
    } catch {
      markPending();
      return;
    }
    if (!result.ok) {
      markPending();
      return;
    }
    writeCloudAvatarSyncState(key, {
      lastSyncedAt: result.data.updatedAt,
      pending: false,
    });
    cloudSyncPending.value = false;
    cloudAlignedAt.value = null;
  }

  async function pullCloudAvatar(): Promise<void> {
    const key = cloudAccountKey.value;
    if (!accountService || !key || !store) return;
    const meta = await accountService.getMyAvatarMeta();
    if (!meta.ok) return;
    const state = readCloudAvatarSyncState(key);
    const action = planCloudAvatarSync({
      isCloudAccount: isCloudAccount.value,
      pending: state.pending,
      serverUpdatedAt: meta.data.updatedAt,
      lastSyncedAt: state.lastSyncedAt,
    });
    if (action === 'upload') {
      if (localUrl.value) await pushCloudAvatar(localUrl.value);
      return;
    }
    if (action !== 'download') return;

    // The user may have picked a new avatar while this request was in flight;
    // never overwrite a newer local edit with the older cloud copy.
    const revisionAtRead = avatarRevision.value;
    const content = await accountService.downloadMyAvatar();
    if (!content.ok || avatarRevision.value !== revisionAtRead) return;
    const blob = dataUrlToPngBlob(content.data.dataUrl);
    if (!blob) return;
    try {
      // A prior server checkpoint plus an existing local file means this
      // download replaced something this device already had, not a first sync.
      const replacedLocalAvatar = state.lastSyncedAt !== null && localUrl.value !== null;
      const alignedAt = replacedLocalAvatar ? Date.now() : null;
      const url = await store.save(accountKey.value, blob);
      if (avatarRevision.value !== revisionAtRead) return;
      localUrl.value = url;
      writeCloudAvatarSyncState(key, {
        lastSyncedAt: content.data.updatedAt,
        pending: false,
        ...(alignedAt === null ? {} : { lastAlignedAt: alignedAt }),
      });
      cloudSyncPending.value = false;
      cloudAlignedAt.value = alignedAt;
      if (alignedAt !== null) {
        toast.info(host?.getI18nGlobal?.().t('account.toast.avatarAlignedWithCloud') ?? '');
      }
      // Every mounted surface reads the same local cache; bump so the quick-login
      // tile, sidebar block and profile card all re-read the pulled avatar.
      avatarRevision.value += 1;
    } catch {
      // Keep the existing local cache; a later entry retries the pull.
    }
  }

  let syncInFlight = false;
  async function refresh(): Promise<void> {
    await loadLocal();
    readSyncFlags();
    if (!isCloudAccount.value || syncInFlight) return;
    syncInFlight = true;
    try {
      await pullCloudAvatar();
    } finally {
      syncInFlight = false;
      readSyncFlags();
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
      const key = cloudAccountKey.value;
      if (key) {
        // Mark the local edit before the revision bump: the reconcile pass then
        // pushes it, and a failure leaves it pending for the next retry. A new
        // local edit supersedes any previously acknowledged cloud alignment.
        const current = readCloudAvatarSyncState(key);
        writeCloudAvatarSyncState(key, {
          lastSyncedAt: current.lastSyncedAt,
          pending: true,
        });
        cloudSyncPending.value = true;
        cloudAlignedAt.value = null;
      }
      avatarRevision.value += 1;
      return url;
    } finally {
      isUploading.value = false;
    }
  }

  const unregisterRetry = registerCloudAvatarRetry(() => {
    void refresh();
  });
  onScopeDispose(unregisterRetry);

  // The shared revision changes after a save on any surface; the account key
  // changes on Profile switch. Both invalidate this instance's cached read.
  watch([accountKey, avatarRevision], () => void refresh(), { immediate: true });

  return {
    avatarUrl,
    localUrl,
    isUploading,
    hasStore: store !== null,
    accountKey,
    isCloudAccount,
    cloudSyncFailed,
    cloudSyncPending,
    cloudAlignedAt,
    dismissCloudAlignment,
    refresh,
    upload,
  };
}
