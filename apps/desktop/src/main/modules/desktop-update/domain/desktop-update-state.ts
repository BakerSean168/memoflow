import type {
  DesktopUpdateFailureDTO,
  DesktopUpdateIntentDTO,
  DesktopUpdateProgressDTO,
  DesktopUpdateReleaseDTO,
  DesktopUpdateStateDTO,
  DesktopUpdateOperationDTO,
} from '@memoflow/contracts/electron';

type StateType = DesktopUpdateStateDTO['type'];
type StateOf<T extends StateType> = Extract<DesktopUpdateStateDTO, { type: T }>;

export class InvalidDesktopUpdateTransitionError extends Error {
  constructor(
    readonly from: StateType,
    readonly action: string,
  ) {
    super(`Desktop Update cannot ${action} from '${from}'`);
    this.name = 'InvalidDesktopUpdateTransitionError';
  }
}

function frozen<T extends DesktopUpdateStateDTO>(state: T): Readonly<T> {
  return Object.freeze(state);
}

function requireState<T extends StateType>(
  state: DesktopUpdateStateDTO,
  expected: readonly T[],
  action: string,
): StateOf<T> {
  if (!expected.includes(state.type as T)) {
    throw new InvalidDesktopUpdateTransitionError(state.type, action);
  }
  return state as StateOf<T>;
}

export function createUninitializedDesktopUpdateState(): Readonly<StateOf<'uninitialized'>> {
  return frozen({ type: 'uninitialized' });
}

export function initializeDesktopUpdateState(
  state: DesktopUpdateStateDTO,
  currentVersion: string,
): Readonly<StateOf<'idle'>> {
  requireState(state, ['uninitialized'], 'initialize');
  return frozen({
    type: 'idle',
    currentVersion,
    lastCheckedAt: null,
    lastOutcome: null,
  });
}

export function disableDesktopUpdate(
  state: DesktopUpdateStateDTO,
  reason: StateOf<'disabled'>['reason'],
): Readonly<StateOf<'disabled'>> {
  requireState(state, ['uninitialized', 'idle'], 'disable');
  return frozen({ type: 'disabled', reason });
}

export function startDesktopUpdateCheck(
  state: DesktopUpdateStateDTO,
  intent: DesktopUpdateIntentDTO,
  startedAt: string,
): Readonly<StateOf<'checking'>> {
  requireState(state, ['idle'], 'start check');
  return frozen({ type: 'checking', intent, startedAt });
}

export function completeDesktopUpdateCheckWithoutRelease(
  state: DesktopUpdateStateDTO,
  currentVersion: string,
  checkedAt: string,
): Readonly<StateOf<'idle'>> {
  requireState(state, ['checking'], 'complete check without release');
  return frozen({
    type: 'idle',
    currentVersion,
    lastCheckedAt: checkedAt,
    lastOutcome: 'up-to-date',
  });
}

export function completeDesktopUpdateCheckWithRelease(
  state: DesktopUpdateStateDTO,
  release: DesktopUpdateReleaseDTO,
  autoDownloadEligible: boolean,
): Readonly<StateOf<'available'>> {
  const checking = requireState(state, ['checking'], 'complete check with release');
  return frozen({
    type: 'available',
    intent: checking.intent,
    release,
    autoDownloadEligible,
  });
}

export function startDesktopUpdateDownload(
  state: DesktopUpdateStateDTO,
): Readonly<StateOf<'downloading'>> {
  const available = requireState(state, ['available'], 'start download');
  return frozen({
    type: 'downloading',
    intent: available.intent,
    release: available.release,
    progress: {
      percent: 0,
      transferredBytes: 0,
      totalBytes: 0,
      bytesPerSecond: 0,
    },
  });
}

export function reportDesktopUpdateDownloadProgress(
  state: DesktopUpdateStateDTO,
  progress: DesktopUpdateProgressDTO,
): Readonly<StateOf<'downloading'>> {
  const downloading = requireState(state, ['downloading'], 'report download progress');
  return frozen({
    ...downloading,
    progress: Object.freeze({ ...progress }),
  });
}

export function completeDesktopUpdateDownload(
  state: DesktopUpdateStateDTO,
): Readonly<StateOf<'downloaded'>> {
  const downloading = requireState(state, ['downloading'], 'complete download');
  return frozen({
    type: 'downloaded',
    intent: downloading.intent,
    release: downloading.release,
  });
}

export function startDesktopUpdatePreparation(
  state: DesktopUpdateStateDTO,
): Readonly<StateOf<'preparing'>> {
  const downloaded = requireState(state, ['downloaded'], 'start preparation');
  return frozen({
    type: 'preparing',
    intent: downloaded.intent,
    release: downloaded.release,
  });
}

export function markDesktopUpdateReady(state: DesktopUpdateStateDTO): Readonly<StateOf<'ready'>> {
  const preparing = requireState(state, ['preparing'], 'mark ready');
  return frozen({
    type: 'ready',
    intent: preparing.intent,
    release: preparing.release,
  });
}

export function requestDesktopUpdateRestart(
  state: DesktopUpdateStateDTO,
): Readonly<StateOf<'restarting'>> {
  const ready = requireState(state, ['ready'], 'request restart');
  return frozen({
    type: 'restarting',
    release: ready.release,
  });
}

function releaseFromState(state: DesktopUpdateStateDTO): DesktopUpdateReleaseDTO | undefined {
  return 'release' in state ? state.release : undefined;
}

function failureRecoveryTarget(state: DesktopUpdateStateDTO): StateOf<'failed'>['recoverableTo'] {
  if (state.type === 'checking') return 'idle';
  if (state.type === 'ready' || state.type === 'restarting') return 'ready';
  return 'available';
}

export function failDesktopUpdate(
  state: DesktopUpdateStateDTO,
  operation: DesktopUpdateOperationDTO,
  failure: DesktopUpdateFailureDTO,
): Readonly<StateOf<'failed'>> {
  requireState(
    state,
    ['checking', 'available', 'downloading', 'downloaded', 'preparing', 'ready', 'restarting'],
    'fail operation',
  );

  const release = releaseFromState(state);
  return frozen({
    type: 'failed',
    operation,
    failure: Object.freeze({ ...failure }),
    recoverableTo: failureRecoveryTarget(state),
    ...(release ? { release } : {}),
  });
}

/**
 * Recover a failed operation to the stable state advertised by recoverableTo.
 *
 * Retry intent is explicit because a fresh user retry must not accidentally
 * inherit a background intent from a previous failed operation.
 */
export function recoverDesktopUpdateFailure(
  state: DesktopUpdateStateDTO,
  options: {
    readonly currentVersion: string;
    readonly recoveredAt: string;
    readonly intent: DesktopUpdateIntentDTO;
  },
): Readonly<StateOf<'idle' | 'available' | 'ready'>> {
  const failed = requireState(state, ['failed'], 'recover failure');

  if (failed.recoverableTo === 'idle') {
    return frozen({
      type: 'idle',
      currentVersion: options.currentVersion,
      lastCheckedAt: options.recoveredAt,
      lastOutcome: 'failed',
    });
  }

  if (!failed.release) {
    throw new InvalidDesktopUpdateTransitionError(state.type, 'recover without release');
  }

  if (failed.recoverableTo === 'ready') {
    return frozen({
      type: 'ready',
      intent: options.intent,
      release: failed.release,
    });
  }

  return frozen({
    type: 'available',
    intent: options.intent,
    release: failed.release,
    autoDownloadEligible: false,
  });
}
