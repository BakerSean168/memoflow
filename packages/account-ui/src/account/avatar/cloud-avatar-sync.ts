/**
 * Cloud avatar conflict planning (Issue #859).
 *
 * Server time is the only authority: last write to reach the server wins, and
 * clients never merge. A local edit that has not reached the server yet
 * (`pending`) always retries first so a stale cloud copy cannot erase it.
 */

export interface CloudAvatarSyncState {
  /** Server timestamp of the last avatar this device uploaded or downloaded. */
  lastSyncedAt: number | null;
  /** True while a local edit still needs to be pushed. */
  pending: boolean;
  /**
   * Epoch milliseconds of the last cloud-newer download that replaced a local
   * avatar. Kept until the user dismisses it or a later upload succeeds.
   */
  lastAlignedAt?: number | null;
}

export type CloudAvatarSyncAction = 'none' | 'upload' | 'download';

export interface CloudAvatarSyncPlanInput extends CloudAvatarSyncState {
  /** Only cloud-bound accounts participate; local accounts always opt out. */
  isCloudAccount: boolean;
  /** Timestamp reported by `GET /accounts/me/avatar/meta`. */
  serverUpdatedAt: number | null;
}

export function planCloudAvatarSync(input: CloudAvatarSyncPlanInput): CloudAvatarSyncAction {
  if (!input.isCloudAccount) return 'none';
  if (input.pending) return 'upload';
  if (input.serverUpdatedAt === null) return 'none';
  if (input.lastSyncedAt === null || input.serverUpdatedAt > input.lastSyncedAt) {
    return 'download';
  }
  return 'none';
}

export interface AvatarSyncStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SYNC_STORAGE_PREFIX = 'memoflow:account-avatar-sync:';

function defaultStorage(): AvatarSyncStorage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function storageKey(accountKey: string): string {
  return `${SYNC_STORAGE_PREFIX}${accountKey}`;
}

export function readCloudAvatarSyncState(
  accountKey: string,
  storage: AvatarSyncStorage | null = defaultStorage(),
): CloudAvatarSyncState {
  if (!storage) return { lastSyncedAt: null, pending: false };
  try {
    const raw = storage.getItem(storageKey(accountKey));
    if (!raw) return { lastSyncedAt: null, pending: false };
    const parsed = JSON.parse(raw) as Partial<CloudAvatarSyncState>;
    const lastAlignedAt = typeof parsed.lastAlignedAt === 'number' ? parsed.lastAlignedAt : null;
    return {
      lastSyncedAt: typeof parsed.lastSyncedAt === 'number' ? parsed.lastSyncedAt : null,
      pending: parsed.pending === true,
      ...(lastAlignedAt === null ? {} : { lastAlignedAt }),
    };
  } catch {
    return { lastSyncedAt: null, pending: false };
  }
}

export function writeCloudAvatarSyncState(
  accountKey: string,
  state: CloudAvatarSyncState,
  storage: AvatarSyncStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey(accountKey), JSON.stringify(state));
  } catch {
    // Storage is best-effort: a failed write only means an extra sync later.
  }
}

/** Convert a `data:image/png;base64,...` URL into a Blob for the avatar store. */
export function dataUrlToPngBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || !dataUrl.slice(0, comma).startsWith('data:image/png')) return null;
  try {
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  } catch {
    return null;
  }
}

/**
 * One shared `online` listener instead of one per mounted avatar surface.
 * Handlers are idempotent (they re-check pending state before pushing).
 */
const retryHandlers = new Set<() => void>();
let onlineBound = false;

export function registerCloudAvatarRetry(handler: () => void): () => void {
  retryHandlers.add(handler);
  if (!onlineBound && typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      for (const retry of retryHandlers) retry();
    });
    onlineBound = true;
  }
  return () => {
    retryHandlers.delete(handler);
  };
}
