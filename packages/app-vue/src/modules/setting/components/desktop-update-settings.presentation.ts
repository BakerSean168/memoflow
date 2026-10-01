import type {
  DesktopUpdateReleaseDTO,
  DesktopUpdateSnapshotDTO,
} from '@memoflow/contracts/electron';

export type DesktopUpdateSettingsKind =
  | 'loading'
  | 'disabled'
  | 'idle'
  | 'up-to-date'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'preparing'
  | 'ready'
  | 'restarting'
  | 'failed';

export type DesktopUpdateSettingsAction = 'none' | 'check' | 'restart';

export interface DesktopUpdateSettingsPresentation {
  readonly kind: DesktopUpdateSettingsKind;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly action: DesktopUpdateSettingsAction;
  readonly actionKey: string | null;
  readonly progressPercent: number | null;
  readonly release: DesktopUpdateReleaseDTO | null;
}

function releaseFromSnapshot(snapshot: DesktopUpdateSnapshotDTO): DesktopUpdateReleaseDTO | null {
  const state = snapshot.state;
  return 'release' in state && state.release ? state.release : null;
}

export function presentDesktopUpdateSettings(
  snapshot: DesktopUpdateSnapshotDTO | null,
  explicitUpToDate = false,
): DesktopUpdateSettingsPresentation {
  if (!snapshot || snapshot.state.type === 'uninitialized') {
    return {
      kind: 'loading',
      titleKey: 'setting.updates.status.loading',
      descriptionKey: 'setting.updates.description.loading',
      action: 'none',
      actionKey: null,
      progressPercent: null,
      release: null,
    };
  }

  const state = snapshot.state;
  const release = releaseFromSnapshot(snapshot);

  switch (state.type) {
    case 'disabled':
      return {
        kind: 'disabled',
        titleKey: 'setting.updates.status.disabled',
        descriptionKey: `setting.updates.disabledReason.${state.reason}`,
        action: 'none',
        actionKey: null,
        progressPercent: null,
        release,
      };

    case 'idle': {
      const upToDate = explicitUpToDate && state.lastOutcome === 'up-to-date';
      return {
        kind: upToDate ? 'up-to-date' : 'idle',
        titleKey: upToDate
          ? 'setting.updates.status.upToDate'
          : 'setting.updates.status.readyToCheck',
        descriptionKey: upToDate
          ? 'setting.updates.description.upToDate'
          : 'setting.updates.description.readyToCheck',
        action: snapshot.capabilities.canCheck ? 'check' : 'none',
        actionKey: snapshot.capabilities.canCheck ? 'setting.updates.check' : null,
        progressPercent: null,
        release,
      };
    }

    case 'checking':
      return {
        kind: 'checking',
        titleKey: 'setting.updates.status.checking',
        descriptionKey: 'setting.updates.description.checking',
        action: 'none',
        actionKey: null,
        progressPercent: null,
        release,
      };

    case 'available':
      return {
        kind: 'available',
        titleKey: 'setting.updates.status.available',
        descriptionKey:
          snapshot.owner === 'package-manager'
            ? 'setting.updates.description.availablePackageManager'
            : state.autoDownloadEligible
              ? 'setting.updates.description.availableAutoDownload'
              : 'setting.updates.description.available',
        action: 'none',
        actionKey: null,
        progressPercent: null,
        release,
      };

    case 'downloading':
      return {
        kind: 'downloading',
        titleKey: 'setting.updates.status.downloading',
        descriptionKey: 'setting.updates.description.downloading',
        action: 'none',
        actionKey: null,
        progressPercent: state.progress.percent,
        release,
      };

    case 'downloaded':
    case 'preparing':
      return {
        kind: 'preparing',
        titleKey: 'setting.updates.status.preparing',
        descriptionKey: 'setting.updates.description.preparing',
        action: 'none',
        actionKey: null,
        progressPercent: null,
        release,
      };

    case 'ready':
      return {
        kind: 'ready',
        titleKey: 'setting.updates.status.updateReady',
        descriptionKey: 'setting.updates.description.updateReady',
        action: snapshot.capabilities.canSelfInstall ? 'restart' : 'none',
        actionKey: snapshot.capabilities.canSelfInstall ? 'setting.updates.restartAndUpdate' : null,
        progressPercent: null,
        release,
      };

    case 'restarting':
      return {
        kind: 'restarting',
        titleKey: 'setting.updates.status.restarting',
        descriptionKey: 'setting.updates.description.restarting',
        action: 'none',
        actionKey: null,
        progressPercent: null,
        release,
      };

    case 'failed': {
      const canRetryInstall =
        state.recoverableTo === 'ready' &&
        state.operation === 'install' &&
        snapshot.capabilities.canSelfInstall;
      const canRetryCheck =
        state.failure.retryable &&
        (state.recoverableTo === 'available'
          ? snapshot.capabilities.canDownload
          : snapshot.capabilities.canCheck);

      return {
        kind: 'failed',
        titleKey: 'setting.updates.status.failed',
        descriptionKey: 'setting.updates.description.failed',
        action: canRetryInstall ? 'restart' : canRetryCheck ? 'check' : 'none',
        actionKey: canRetryInstall
          ? 'setting.updates.retryInstall'
          : canRetryCheck
            ? state.recoverableTo === 'available'
              ? 'setting.updates.retryDownload'
              : 'setting.updates.retryCheck'
            : null,
        progressPercent: null,
        release,
      };
    }
  }
}
