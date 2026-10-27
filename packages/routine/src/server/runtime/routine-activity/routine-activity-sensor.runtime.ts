import { asInstant, type Instant } from '@memoflow/time';
import type {
  ActivitySensorPort,
  IdleSensorPort,
  RoutineActivityEvent,
  RoutineActivityListener,
  RoutineActivitySnapshot,
} from '../../domain/ports';

export interface RoutineActivitySensorRuntime extends ActivitySensorPort {
  start(): void;
  stop(): void;
  readonly isStarted: boolean;
}

export interface CreateRoutineActivitySensorRuntimeOptions {
  readonly idleSensor: IdleSensorPort;
  readonly idleThresholdMs: number;
  readonly now?: () => number;
}

/**
 * Normalizes the platform IdleSensor capability into Routine-owned activity
 * events. It is restart-safe: start/stop may be repeated without leaking or
 * duplicating subscriptions.
 */
export function createRoutineActivitySensorRuntime(
  options: CreateRoutineActivitySensorRuntimeOptions,
): RoutineActivitySensorRuntime {
  if (!Number.isFinite(options.idleThresholdMs) || options.idleThresholdMs <= 0) {
    throw new TypeError('idleThresholdMs must be a positive finite number');
  }

  const now = options.now ?? Date.now;
  const listeners = new Set<RoutineActivityListener>();
  let snapshot: RoutineActivitySnapshot = {
    state: 'active',
    observedAt: asInstant(now()),
    idleDurationMs: 0,
  };
  let started = false;
  let unsubscribeIdle: (() => void) | null = null;
  let unsubscribeResume: (() => void) | null = null;

  const publish = (event: RoutineActivityEvent): void => {
    for (const listener of [...listeners]) listener(event);
  };

  const becomeIdle = (at: Instant, idleDurationMs: number): void => {
    const normalizedIdleMs = Math.max(0, idleDurationMs);
    if (snapshot.state === 'idle') {
      snapshot = { state: 'idle', observedAt: at, idleDurationMs: normalizedIdleMs };
      return;
    }
    snapshot = { state: 'idle', observedAt: at, idleDurationMs: normalizedIdleMs };
    publish({ type: 'UserIdle', at, idleDurationMs: normalizedIdleMs });
  };

  const becomeResumed = (at: Instant, previousIdleDurationMs: number): void => {
    if (snapshot.state !== 'idle') return;
    const normalizedIdleMs = Math.max(snapshot.idleDurationMs, previousIdleDurationMs, 0);
    snapshot = { state: 'active', observedAt: at, idleDurationMs: 0 };
    publish({ type: 'UserResumed', at, idleDurationMs: normalizedIdleMs });
  };

  return {
    get isStarted() {
      return started;
    },
    getCurrentActivityState() {
      return { ...snapshot };
    },
    onActivityChanged(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (started) return;

      // Subscribe before sampling so a transition cannot fall into a startup
      // listener-registration gap.
      unsubscribeIdle = options.idleSensor.onIdle((event) => {
        becomeIdle(event.at, event.idleDurationMs);
      });
      unsubscribeResume = options.idleSensor.onResume((event) => {
        becomeResumed(event.at, event.idleDurationMs);
      });
      started = true;

      const observedAt = asInstant(now());
      const idleDurationMs = Math.max(0, options.idleSensor.getIdleDurationMs());
      if (idleDurationMs >= options.idleThresholdMs) {
        becomeIdle(observedAt, idleDurationMs);
      } else {
        snapshot = { state: 'active', observedAt, idleDurationMs: 0 };
        publish({ type: 'UserActive', at: observedAt, idleDurationMs: 0 });
      }
    },
    stop() {
      if (!started) return;
      // Flip state before callbacks are removed so reentrant stop remains safe.
      started = false;
      unsubscribeResume?.();
      unsubscribeIdle?.();
      unsubscribeResume = null;
      unsubscribeIdle = null;
    },
  };
}
