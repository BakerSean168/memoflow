import type {
  InterventionWindowCommand,
  InterventionWindowProjection,
  InterventionWindowState,
} from '@memoflow/contracts/electron';
import type { InterventionRuntime, InterventionSnapshot } from '@memoflow/reminder/routine-runtime';

const SURFACE_STATES: readonly InterventionWindowState[] = ['Gentle', 'Grace', 'Guided'];
const STATE_PRIORITY: Readonly<Record<InterventionWindowState, number>> = {
  Gentle: 1,
  Grace: 2,
  Guided: 3,
};

export interface InterventionWindowHost {
  show(projection: InterventionWindowProjection): void;
  update(projection: InterventionWindowProjection): void;
  hide(): void;
  onCloseRequested(listener: () => void): () => void;
  destroy(): void;
}

export interface InterventionWindowController {
  present(occurrenceKey: string): InterventionWindowProjection | null;
  restoreIdentity(identityId: string): InterventionWindowProjection | null;
  getProjection(): InterventionWindowProjection | null;
  execute(command: InterventionWindowCommand): Promise<InterventionWindowProjection | null>;
  destroy(): void;
}

export interface CreateInterventionWindowControllerOptions {
  readonly runtime: InterventionRuntime;
  readonly host: InterventionWindowHost;
  /** Persist the owner-domain interaction before the presentation runtime advances. */
  readonly onCommand?: (input: {
    readonly commandId: string;
    readonly snapshot: InterventionSnapshot;
    readonly command: InterventionWindowCommand;
    readonly at: number;
  }) => Promise<void>;
  readonly now?: () => number;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
}

function isSurfaceState(state: InterventionSnapshot['state']): state is InterventionWindowState {
  return (SURFACE_STATES as readonly string[]).includes(state);
}

function toProjection(snapshot: InterventionSnapshot, now: number): InterventionWindowProjection {
  if (!isSurfaceState(snapshot.state)) {
    throw new TypeError(
      `Intervention state '${snapshot.state}' cannot be projected by InterventionWindow`,
    );
  }
  const phaseDeadline = snapshot.phaseDeadline == null ? null : Number(snapshot.phaseDeadline);
  return {
    identityId: snapshot.identityId,
    routineId: snapshot.routineId,
    occurrenceKey: snapshot.occurrenceKey,
    state: snapshot.state,
    version: snapshot.version,
    dueAt: Number(snapshot.dueAt),
    phaseEnteredAt: Number(snapshot.phaseEnteredAt),
    phaseDeadline,
    remainingMs: phaseDeadline == null ? null : Math.max(0, phaseDeadline - now),
  };
}

function compareCandidates(a: InterventionSnapshot, b: InterventionSnapshot): number {
  const aPriority = isSurfaceState(a.state) ? STATE_PRIORITY[a.state] : 0;
  const bPriority = isSurfaceState(b.state) ? STATE_PRIORITY[b.state] : 0;
  if (aPriority !== bPriority) return bPriority - aPriority;
  const dueDelta = Number(a.dueAt) - Number(b.dueAt);
  if (dueDelta !== 0) return dueDelta;
  return a.occurrenceKey.localeCompare(b.occurrenceKey);
}

function commandIdFor(
  snapshot: InterventionSnapshot,
  command: InterventionWindowCommand,
): string {
  const suffix = command.action === 'snooze' ? `:${command.durationMs}` : '';
  return `${snapshot.occurrenceKey}:v${snapshot.version}:${command.action}${suffix}`;
}

export function createInterventionWindowController(
  options: CreateInterventionWindowControllerOptions,
): InterventionWindowController {
  const now = options.now ?? Date.now;
  const setTimeoutFn = options.setTimeout ?? globalThis.setTimeout;
  const clearTimeoutFn = options.clearTimeout ?? globalThis.clearTimeout;
  let identityId: string | null = null;
  let projection: InterventionWindowProjection | null = null;
  let deadlineTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let destroyed = false;
  let syncing = false;
  let applyingCommand = false;

  const clearDeadlineTimer = (): void => {
    if (deadlineTimer == null) return;
    clearTimeoutFn(deadlineTimer);
    deadlineTimer = null;
  };

  const activeForIdentity = (): InterventionSnapshot[] => {
    if (!identityId) return [];
    return options.runtime.listActive().filter((snapshot) => snapshot.identityId === identityId);
  };

  const selectCandidate = (
    snapshots: readonly InterventionSnapshot[],
  ): InterventionSnapshot | null =>
    [...snapshots]
      .filter((snapshot) => isSurfaceState(snapshot.state))
      .sort(compareCandidates)[0] ?? null;

  const scheduleNextWake = (controller: InterventionWindowController): void => {
    clearDeadlineTimer();
    if (destroyed || !identityId) return;
    const currentTime = now();
    const nextBoundary = activeForIdentity()
      .map((snapshot) => {
        if (snapshot.state === 'Due') return Number(snapshot.dueAt);
        if (snapshot.state === 'Snoozed' && snapshot.snoozeUntil != null) {
          return Number(snapshot.snoozeUntil);
        }
        if (snapshot.phaseDeadline != null) return Number(snapshot.phaseDeadline);
        return null;
      })
      .filter((value): value is number => value != null && Number.isFinite(value))
      .sort((a, b) => a - b)[0];
    if (nextBoundary == null) return;
    const delay = Math.max(0, nextBoundary - currentTime);
    deadlineTimer = setTimeoutFn(
      () => {
        deadlineTimer = null;
        if (!destroyed) controller.restoreIdentity(identityId!);
      },
      Math.min(delay, 2_147_483_647),
    );
    deadlineTimer.unref?.();
  };

  const sync = (controller: InterventionWindowController): InterventionWindowProjection | null => {
    if (destroyed) throw new Error('InterventionWindowController is destroyed');
    if (!identityId) return null;
    if (syncing) return controller.getProjection();

    syncing = true;
    try {
      const at = now();
      for (const snapshot of activeForIdentity()) {
        options.runtime.advance(snapshot.occurrenceKey, at);
      }

      const candidate = selectCandidate(activeForIdentity());
      if (!candidate) {
        projection = null;
        options.host.hide();
        scheduleNextWake(controller);
        return null;
      }

      const next = toProjection(candidate, at);
      const sameOccurrence = projection?.occurrenceKey === next.occurrenceKey;
      projection = next;
      if (sameOccurrence) options.host.update(next);
      else options.host.show(next);
      scheduleNextWake(controller);
      return { ...next };
    } finally {
      syncing = false;
    }
  };

  const controller: InterventionWindowController = {
    present(occurrenceKey) {
      if (destroyed) throw new Error('InterventionWindowController is destroyed');
      const snapshot = options.runtime.getSnapshot(occurrenceKey);
      if (!snapshot) throw new Error(`Intervention '${occurrenceKey}' is not available`);
      identityId = snapshot.identityId;
      return sync(controller);
    },

    restoreIdentity(nextIdentityId) {
      if (destroyed) throw new Error('InterventionWindowController is destroyed');
      if (!nextIdentityId.trim()) throw new TypeError('Intervention identityId must not be empty');
      identityId = nextIdentityId;
      return sync(controller);
    },

    getProjection() {
      return projection ? { ...projection } : null;
    },

    async execute(command) {
      if (destroyed) throw new Error('InterventionWindowController is destroyed');
      if (!projection) throw new Error('InterventionWindow has no active occurrence');
      const snapshot = options.runtime.getSnapshot(projection.occurrenceKey);
      if (!snapshot) throw new Error(`Intervention '${projection.occurrenceKey}' is not available`);
      const at = now();
      const commandId = commandIdFor(snapshot, command);

      // Presentation is fail-closed: owner-domain persistence must succeed before
      // the in-memory InterventionRuntime can make the action look accepted.
      // Keeping the snapshot/version unchanged also makes a transport retry use
      // the same stable command id.
      await options.onCommand?.({ commandId, snapshot, command, at });

      applyingCommand = true;
      try {
        options.runtime.execute(snapshot.occurrenceKey, { ...command, at });
      } finally {
        applyingCommand = false;
      }
      return sync(controller);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearDeadlineTimer();
      unsubscribeRuntime();
      unsubscribeClose();
      options.host.destroy();
      projection = null;
      identityId = null;
    },
  };

  const unsubscribeRuntime = options.runtime.onChanged((snapshot) => {
    if (destroyed || syncing || applyingCommand || snapshot.identityId !== identityId) return;
    sync(controller);
  });
  const unsubscribeClose = options.host.onCloseRequested(() => {
    if (destroyed || !projection) return;
    // Electron host prevents native close. If persistence fails, leave the
    // surface visible and the runtime unchanged so the user can retry.
    void controller.execute({ action: 'dismiss' }).catch(() => undefined);
  });

  return controller;
}
