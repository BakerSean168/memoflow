export interface RoutineWallClockOccurrencePayload {
  readonly routineId: string;
  readonly identityId: string;
  readonly occurrenceKey: string;
  readonly scheduledFor: number;
  readonly sourceRevision: string | number | null;
}

export interface RoutineElapsedOccurrencePayload {
  readonly routineId: string;
  readonly identityId: string;
  readonly occurrenceKey: string;
  /**
   * Optional NotificationRequested idempotency instance. Snooze wake-ups use a
   * distinct value while still targeting the same business occurrenceKey.
   */
  readonly notificationOccurrenceKey?: string;
  /** Actual Scheduler wake-up time; may be shifted by a temporary override. */
  readonly scheduledFor: number;
  /** Canonical business due boundary before any snooze/suppress delay. */
  readonly dueAt: number;
  readonly sourceRevision: string | number | null;
}

export interface RoutineOccurrenceCommittedEvent {
  readonly routineId: string;
  readonly identityId: string;
  readonly occurrenceKey: string;
  readonly scheduledFor: number;
}

/** Snooze/override changed: rebuild the routine's desired scheduling set now. */
export interface RoutineOverrideChangedEvent {
  readonly routineId: string;
  readonly identityId: string;
}

/** Durable owner truth changed and the Scheduler projection must be rebuilt. */
export interface RoutineScheduleChangedEvent {
  readonly routineId: string;
  readonly identityId: string;
}

/**
 * NOTE: this stays a TYPE LITERAL, not an interface. `TypedEventMap` constrains
 * the keyed payload map to `Record<string, unknown>`, and only a type literal
 * carries an implicit string index signature. Interfaces do NOT — they would
 * widen to `string` and instantly break every `Subscriber<...>` wiring.
 */
export type RoutineScheduleProjectionEventMap = {
  readonly 'routine:occurrence-committed': RoutineOccurrenceCommittedEvent;
  readonly 'routine:override-changed': RoutineOverrideChangedEvent;
  readonly 'routine:schedule-changed': RoutineScheduleChangedEvent;
};

export const routineScheduleProjectionEventNames = [
  'routine:occurrence-committed',
  'routine:override-changed',
  'routine:schedule-changed',
] as const satisfies readonly (keyof RoutineScheduleProjectionEventMap)[];
