import type { FocusWindowCommand, FocusWindowProjection } from '@memoflow/contracts/electron';
import type {
  ProtocolSessionRuntime,
  ProtocolSessionStore,
} from '@memoflow/routine/routine-runtime';

export interface FocusWindowHost {
  show(projection: FocusWindowProjection): void;
  update(projection: FocusWindowProjection): void;
  hide(): void;
  setCollapsed(collapsed: boolean): void;
  setAlwaysOnTop(enabled: boolean): void;
  destroy(): void;
}

export interface FocusTaskbarIntegrationPort {
  update(projection: FocusWindowProjection): void;
  clear(): void;
}

export interface FocusWindowController {
  open(identityId: string, sessionId: string): Promise<FocusWindowProjection>;
  restoreIdentity(identityId: string): Promise<FocusWindowProjection | null>;
  getProjection(): FocusWindowProjection | null;
  execute(command: FocusWindowCommand): Promise<FocusWindowProjection | null>;
  destroy(): void;
}

export interface CreateFocusWindowControllerOptions {
  readonly store: ProtocolSessionStore;
  readonly runtime: ProtocolSessionRuntime;
  readonly host: FocusWindowHost;
  readonly taskbar?: FocusTaskbarIntegrationPort;
  readonly now?: () => number;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
}

type StoredSession = NonNullable<Awaited<ReturnType<ProtocolSessionStore['findById']>>>;

function toProjection(session: StoredSession, now: number): FocusWindowProjection {
  const snapshot = session.snapshot();
  const phase = session.currentPhase;
  const phaseIndex = snapshot.currentPlanIndex;
  const phaseDeadline = snapshot.phaseDeadline == null ? null : Number(snapshot.phaseDeadline);
  const remainingMs =
    snapshot.state === 'Paused'
      ? snapshot.pausedRemainingMs
      : phaseDeadline == null
        ? null
        : Math.max(0, phaseDeadline - now);

  return {
    identityId: snapshot.identityId,
    sessionId: snapshot.id,
    protocolId: snapshot.protocolId,
    protocolName: snapshot.protocolSnapshot.name,
    protocolVersion: snapshot.protocolVersion,
    state: snapshot.state,
    version: snapshot.version,
    phaseId: phase?.id ?? null,
    phaseKind: phase?.kind ?? null,
    phaseIndex,
    phaseCount: snapshot.phasePlan.length,
    cycle: phase?.cycle ?? null,
    totalCycles: snapshot.protocolSnapshot.cyclePolicy.cycles,
    phaseDurationMs: phase?.durationMs ?? null,
    phaseDeadline,
    pausedRemainingMs: snapshot.pausedRemainingMs,
    remainingMs,
    terminationReason: snapshot.terminationReason,
  };
}

export function createFocusWindowController(
  options: CreateFocusWindowControllerOptions,
): FocusWindowController {
  const now = options.now ?? Date.now;
  const setTimeoutFn = options.setTimeout ?? globalThis.setTimeout;
  const clearTimeoutFn = options.clearTimeout ?? globalThis.clearTimeout;
  let current: { identityId: string; sessionId: string } | null = null;
  let projection: FocusWindowProjection | null = null;
  let deadlineTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let destroyed = false;

  const clearDeadlineTimer = (): void => {
    if (deadlineTimer == null) return;
    clearTimeoutFn(deadlineTimer);
    deadlineTimer = null;
  };

  const publish = (next: FocusWindowProjection, show: boolean): FocusWindowProjection => {
    projection = next;
    if (show) options.host.show(next);
    else options.host.update(next);
    options.taskbar?.update(next);
    return next;
  };

  const loadRequired = async (): Promise<StoredSession> => {
    if (!current) throw new Error('FocusWindow has no bound ProtocolSession');
    const session = await options.store.findById(current);
    if (!session) throw new Error(`ProtocolSession '${current.sessionId}' is no longer available`);
    return session;
  };

  const scheduleDeadline = (controller: FocusWindowController): void => {
    clearDeadlineTimer();
    if (!projection || projection.state !== 'Running' || projection.phaseDeadline == null) return;
    const delay = Math.max(0, projection.phaseDeadline - now());
    deadlineTimer = setTimeoutFn(
      () => {
        deadlineTimer = null;
        if (!destroyed && current) void controller.open(current.identityId, current.sessionId);
      },
      Math.min(delay, 2_147_483_647),
    );
    deadlineTimer.unref?.();
  };

  const controller: FocusWindowController = {
    async open(identityId, sessionId) {
      if (destroyed) throw new Error('FocusWindowController is destroyed');
      current = { identityId, sessionId };
      await options.runtime.recoverSession({ identityId, sessionId, at: now() });
      const session = await loadRequired();
      const next = publish(toProjection(session, now()), true);
      scheduleDeadline(controller);
      return next;
    },

    async restoreIdentity(identityId) {
      if (destroyed) throw new Error('FocusWindowController is destroyed');
      const sessions = await options.store.listRecoverable({ identityId });
      const latest = sessions[sessions.length - 1];
      if (!latest) return null;
      return controller.open(identityId, latest.id);
    },

    getProjection() {
      return projection ? { ...projection } : null;
    },

    async execute(command) {
      if (destroyed) throw new Error('FocusWindowController is destroyed');
      if (command.action === 'hide') {
        // Window visibility is presentation only. Keep the durable deadline
        // timer running so a hidden session can still advance/resurface at the
        // next phase boundary.
        options.host.hide();
        options.taskbar?.clear();
        return controller.getProjection();
      }
      if (command.action === 'collapse') {
        options.host.setCollapsed(command.collapsed);
        return controller.getProjection();
      }
      if (command.action === 'always-on-top') {
        options.host.setAlwaysOnTop(command.enabled);
        return controller.getProjection();
      }
      if (!current) throw new Error('FocusWindow has no bound ProtocolSession');

      await options.runtime.transition({
        identityId: current.identityId,
        sessionId: current.sessionId,
        action: command.action,
        at: now(),
      });
      const session = await loadRequired();
      const next = publish(toProjection(session, now()), false);
      if (next.state === 'Completed' || next.state === 'Cancelled') {
        clearDeadlineTimer();
        options.taskbar?.clear();
      } else {
        scheduleDeadline(controller);
      }
      return next;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearDeadlineTimer();
      options.taskbar?.clear();
      options.host.destroy();
      current = null;
      projection = null;
    },
  };

  return controller;
}
