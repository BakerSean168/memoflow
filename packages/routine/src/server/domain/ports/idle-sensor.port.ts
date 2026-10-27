import type { Instant } from '@memoflow/time';

export interface UserIdleObserved {
  readonly at: Instant;
  readonly idleDurationMs: number;
}

export interface UserResumeObserved {
  readonly at: Instant;
  /** Last observed idle duration immediately before activity resumed. */
  readonly idleDurationMs: number;
}

/**
 * Low-level platform capability. Concrete OS/Electron APIs stay behind this
 * port and never enter Routine domain/runtime code.
 */
export interface IdleSensorPort {
  getIdleDurationMs(): number;
  onIdle(listener: (event: UserIdleObserved) => void): () => void;
  onResume(listener: (event: UserResumeObserved) => void): () => void;
}
