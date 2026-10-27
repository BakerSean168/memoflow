import type { Instant } from '@memoflow/time';

export type RoutineActivityState = 'active' | 'idle';

export interface RoutineActivitySnapshot {
  readonly state: RoutineActivityState;
  readonly observedAt: Instant;
  readonly idleDurationMs: number;
}

export type RoutineActivityEvent =
  | {
      readonly type: 'UserActive';
      readonly at: Instant;
      readonly idleDurationMs: 0;
    }
  | {
      readonly type: 'UserIdle';
      readonly at: Instant;
      readonly idleDurationMs: number;
    }
  | {
      readonly type: 'UserResumed';
      readonly at: Instant;
      readonly idleDurationMs: number;
    };

export type RoutineActivityListener = (event: RoutineActivityEvent) => void;

/** Platform-neutral activity stream consumed by Routine Runtime. */
export interface ActivitySensorPort {
  getCurrentActivityState(): RoutineActivitySnapshot;
  onActivityChanged(listener: RoutineActivityListener): () => void;
}
