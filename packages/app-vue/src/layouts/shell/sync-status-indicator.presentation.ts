import type {
  DesktopSyncErrorCategoryDTO,
  DesktopSyncPhaseDTO,
  DesktopSyncSnapshotDTO,
  ProfileCloudState,
} from '@memoflow/desktop-contracts';

export type SyncIndicatorState = 'synced' | 'pending' | 'offline' | 'error';

export interface SyncProfileItem {
  readonly id: 'nickname' | 'bio' | 'avatar';
  readonly labelKey: string;
  /** Current value; null for the avatar row. */
  readonly value: string | null;
  /** Shown when the value itself is intentionally not displayed. */
  readonly detailKey?: string;
}

export interface SyncBusinessPresentation {
  readonly phase: DesktopSyncPhaseDTO;
  readonly phaseKey: string;
  readonly lastSyncedAt: number | null;
  readonly errorCategory: DesktopSyncErrorCategoryDTO | null;
  readonly pending: boolean;
}

export interface SyncStatusIndicatorPresentation {
  readonly state: SyncIndicatorState;
  readonly badgeCount: number | null;
  /** Red badge even when the count is zero (rejected sync). */
  readonly showAlertBadge: boolean;
  readonly profileItems: readonly SyncProfileItem[];
  readonly business: SyncBusinessPresentation;
  readonly lastSyncedAt: number | null;
  readonly errorCategory: DesktopSyncErrorCategoryDTO | null;
  readonly showOfflineNote: boolean;
}

export interface SyncIndicatorInput {
  readonly cloudAccountBound: boolean;
  readonly cloudState?: ProfileCloudState;
  readonly snapshot: DesktopSyncSnapshotDTO | null;
  readonly avatarPending: boolean;
}

const PHASE_KEYS: Readonly<Record<DesktopSyncPhaseDTO, string>> = {
  idle: 'shell.sync.phase.idle',
  connecting: 'shell.sync.phase.connecting',
  download_error: 'shell.sync.phase.downloadError',
  connected: 'shell.sync.phase.connected',
  synced: 'shell.sync.phase.synced',
};

function latest(...values: Array<number | null>): number | null {
  let result: number | null = null;
  for (const value of values) {
    if (value === null) continue;
    result = result === null ? value : Math.max(result, value);
  }
  return result;
}

/**
 * Project the sanitized main-process snapshot into the tiny shell indicator
 * surface. No counts are invented: the business dataset contributes one
 * pending row when it has not completed a sync.
 */
export function presentSyncStatusIndicator(
  input: SyncIndicatorInput,
): SyncStatusIndicatorPresentation | null {
  if (!input.cloudAccountBound || !input.snapshot) return null;

  const { snapshot } = input;
  const profileItems: SyncProfileItem[] = snapshot.profile.pendingFields.map((field) =>
    field.field === 'nickname'
      ? {
          id: 'nickname',
          labelKey: 'shell.sync.profile.nickname',
          value: field.value,
        }
      : {
          id: 'bio',
          labelKey: 'shell.sync.profile.bio',
          value: field.value || null,
          detailKey: field.value ? undefined : 'shell.sync.profile.bioChanged',
        },
  );
  if (input.avatarPending) {
    profileItems.push({
      id: 'avatar',
      labelKey: 'shell.sync.profile.avatar',
      value: null,
      detailKey: 'shell.sync.profile.avatarPending',
    });
  }

  const businessPending = snapshot.business.pending;
  const totalPending = profileItems.length + (businessPending ? 1 : 0);
  const errorCategory = snapshot.profile.failureCategory ?? snapshot.business.errorCategory;
  // The cloud connection badge is the primary reachability signal; a network
  // failure reported by either delivery path keeps the indicator honest when
  // that snapshot has not refreshed yet.
  const offline = input.cloudState === 'OFFLINE' || errorCategory === 'network';
  const errored = input.cloudState === 'REAUTH_REQUIRED' || errorCategory !== null;

  const state: SyncIndicatorState = offline
    ? 'offline'
    : errored
      ? 'error'
      : totalPending > 0
        ? 'pending'
        : 'synced';

  return {
    state,
    badgeCount: state === 'pending' || state === 'error' ? totalPending || null : null,
    showAlertBadge: state === 'error',
    profileItems,
    business: {
      phase: snapshot.business.phase,
      phaseKey: PHASE_KEYS[snapshot.business.phase],
      lastSyncedAt: snapshot.business.lastSyncedAt,
      errorCategory: snapshot.business.errorCategory,
      pending: businessPending,
    },
    lastSyncedAt: latest(snapshot.profile.lastSyncedAt, snapshot.business.lastSyncedAt),
    errorCategory,
    showOfflineNote: offline,
  };
}
