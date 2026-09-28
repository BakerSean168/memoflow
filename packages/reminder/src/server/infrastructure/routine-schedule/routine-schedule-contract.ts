import type { ScheduledIntent, SchedulingOwner } from '@memoflow/contracts/schedule';
import { buildSchedulingKey } from '@memoflow/contracts/schedule';

/** Neutral scheduler-handler keys for durable Routine timing lanes. */
export const ROUTINE_WALLCLOCK_HANDLER_KEY = 'routine.wallclock.fire';
export const ROUTINE_ELAPSED_HANDLER_KEY = 'routine.elapsed.fire';

export const ROUTINE_WALLCLOCK_PAYLOAD_VERSION = 1;
export const ROUTINE_ELAPSED_PAYLOAD_VERSION = 1;

export const ROUTINE_SCHEDULING_OWNER_TYPE = 'routine.routine';

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

export function buildRoutineWallClockPayload(input: {
  readonly routineId: string;
  readonly identityId: string;
  readonly occurrenceKey: string;
  readonly scheduledFor: number;
  readonly sourceRevision?: string | number | null;
}): RoutineWallClockOccurrencePayload {
  return {
    routineId: input.routineId,
    identityId: input.identityId,
    occurrenceKey: input.occurrenceKey,
    scheduledFor: input.scheduledFor,
    sourceRevision: input.sourceRevision ?? null,
  };
}

/**
 * Strict payload validation for the neutral scheduled-handler registry.
 * A TypeError here maps to a dead-lettered `PAYLOAD_VALIDATION_FAILED`
 * outcome (never a retryable failure).
 */
export function parseRoutineWallClockPayload(payload: unknown): RoutineWallClockOccurrencePayload {
  if (!isRecord(payload)) {
    throw new TypeError('Routine wall-clock payload must be an object');
  }
  const routineId = requireString(payload.routineId, 'routineId');
  const identityId = requireString(payload.identityId, 'identityId');
  const occurrenceKey = requireString(payload.occurrenceKey, 'occurrenceKey');
  const scheduledFor = requireFiniteNumber(payload.scheduledFor, 'scheduledFor');
  const sourceRevision = payload.sourceRevision ?? null;
  if (
    sourceRevision !== null &&
    typeof sourceRevision !== 'string' &&
    typeof sourceRevision !== 'number'
  ) {
    throw new TypeError('sourceRevision must be a string, a number, or null');
  }
  return { routineId, identityId, occurrenceKey, scheduledFor, sourceRevision };
}

export function buildRoutineElapsedPayload(input: {
  readonly routineId: string;
  readonly identityId: string;
  readonly occurrenceKey: string;
  readonly notificationOccurrenceKey?: string;
  readonly scheduledFor: number;
  readonly dueAt: number;
  readonly sourceRevision?: string | number | null;
}): RoutineElapsedOccurrencePayload {
  return {
    routineId: input.routineId,
    identityId: input.identityId,
    occurrenceKey: input.occurrenceKey,
    ...(input.notificationOccurrenceKey
      ? { notificationOccurrenceKey: input.notificationOccurrenceKey }
      : {}),
    scheduledFor: input.scheduledFor,
    dueAt: input.dueAt,
    sourceRevision: input.sourceRevision ?? null,
  };
}

export function parseRoutineElapsedPayload(payload: unknown): RoutineElapsedOccurrencePayload {
  if (!isRecord(payload)) {
    throw new TypeError('Routine elapsed payload must be an object');
  }
  const routineId = requireString(payload.routineId, 'routineId');
  const identityId = requireString(payload.identityId, 'identityId');
  const occurrenceKey = requireString(payload.occurrenceKey, 'occurrenceKey');
  const notificationOccurrenceKey =
    payload.notificationOccurrenceKey == null
      ? undefined
      : requireString(payload.notificationOccurrenceKey, 'notificationOccurrenceKey');
  const scheduledFor = requireFiniteNumber(payload.scheduledFor, 'scheduledFor');
  const dueAt = requireFiniteNumber(payload.dueAt, 'dueAt');
  const sourceRevision = payload.sourceRevision ?? null;
  if (
    sourceRevision !== null &&
    typeof sourceRevision !== 'string' &&
    typeof sourceRevision !== 'number'
  ) {
    throw new TypeError('sourceRevision must be a string, a number, or null');
  }
  return {
    routineId,
    identityId,
    occurrenceKey,
    ...(notificationOccurrenceKey ? { notificationOccurrenceKey } : {}),
    scheduledFor,
    dueAt,
    sourceRevision,
  };
}

export function buildRoutineWallClockOwner(routineId: string, identityId: string): SchedulingOwner {
  return { identityId, type: ROUTINE_SCHEDULING_OWNER_TYPE, id: routineId };
}

export function buildRoutineElapsedSchedulingKey(routineId: string, occurrenceKey: string): string {
  return buildSchedulingKey('routine.elapsed', routineId, occurrenceKey);
}

export function buildRoutineWallClockSchedulingKey(
  routineId: string,
  occurrenceKey: string,
): string {
  return buildSchedulingKey('routine.wallclock', routineId, occurrenceKey);
}

export function buildRoutineWallClockIntent(input: {
  readonly routineId: string;
  readonly identityId: string;
  readonly routineName: string;
  readonly occurrenceKey: string;
  readonly scheduledFor: number;
  readonly sourceRevision?: string | number | null;
}): ScheduledIntent<RoutineWallClockOccurrencePayload> {
  return {
    schedulingKey: buildRoutineWallClockSchedulingKey(input.routineId, input.occurrenceKey),
    handlerKey: ROUTINE_WALLCLOCK_HANDLER_KEY,
    runAt: input.scheduledFor,
    payloadVersion: ROUTINE_WALLCLOCK_PAYLOAD_VERSION,
    payload: buildRoutineWallClockPayload(input),
    sourceRevision: input.sourceRevision ?? undefined,
    observability: {
      name: input.routineName,
      tags: [ROUTINE_SCHEDULING_OWNER_TYPE],
    },
  };
}

export function buildRoutineElapsedIntent(input: {
  readonly routineId: string;
  readonly identityId: string;
  readonly routineName: string;
  readonly occurrenceKey: string;
  readonly notificationOccurrenceKey?: string;
  readonly scheduledFor: number;
  readonly dueAt: number;
  readonly sourceRevision?: string | number | null;
}): ScheduledIntent<RoutineElapsedOccurrencePayload> {
  return {
    schedulingKey: buildRoutineElapsedSchedulingKey(
      input.routineId,
      input.notificationOccurrenceKey ?? input.occurrenceKey,
    ),
    handlerKey: ROUTINE_ELAPSED_HANDLER_KEY,
    runAt: input.scheduledFor,
    payloadVersion: ROUTINE_ELAPSED_PAYLOAD_VERSION,
    payload: buildRoutineElapsedPayload(input),
    sourceRevision: input.sourceRevision ?? undefined,
    observability: {
      name: input.routineName,
      tags: [ROUTINE_SCHEDULING_OWNER_TYPE, 'elapsed'],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number`);
  }
  return value;
}
