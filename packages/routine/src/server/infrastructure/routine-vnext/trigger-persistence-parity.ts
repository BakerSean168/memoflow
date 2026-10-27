import type { Instant } from '@memoflow/time';
import {
  createActiveUsageTrigger,
  createElapsedTrigger,
  createTemporaryOverride,
  createWallClockTrigger,
  type RoutineTemporaryOverride,
  type RoutineTrigger,
} from '../../domain/routine';

/** Canonical persistence codec shared conceptually by Prisma and PowerSync adapters. */
export function serializeRoutineTrigger(trigger: RoutineTrigger | null): string | null {
  return trigger == null ? null : JSON.stringify(trigger);
}

export function deserializeRoutineTrigger(raw: string | null): RoutineTrigger | null {
  if (raw == null) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    throw new TypeError('Invalid persisted RoutineTrigger');
  }

  switch (parsed.type) {
    case 'WallClock': {
      const recurrence = requireRecord(parsed.recurrence, 'WallClock.recurrence');
      return createWallClockTrigger({
        localTime: requireString(parsed.localTime, 'WallClock.localTime'),
        timeZone: requireString(parsed.timeZone, 'WallClock.timeZone'),
        recurrence: {
          startDate: requireString(recurrence.startDate, 'WallClock.recurrence.startDate'),
          frequency: requireRecurrenceFrequency(recurrence.frequency),
          interval: requireNumber(recurrence.interval, 'WallClock.recurrence.interval'),
          byWeekday: requireWeekdays(recurrence.byWeekday),
          count:
            recurrence.count == null
              ? null
              : requireNumber(recurrence.count, 'WallClock.recurrence.count'),
          until:
            recurrence.until == null
              ? null
              : requireNumber(recurrence.until, 'WallClock.recurrence.until'),
        },
      });
    }
    case 'Elapsed':
      return createElapsedTrigger({
        durationMs: requireNumber(parsed.durationMs, 'Elapsed.durationMs'),
        anchor: requireElapsedAnchor(parsed.anchor),
      });
    case 'ActiveUsage': {
      const naturalBreak =
        parsed.naturalBreakCredit == null
          ? null
          : requireRecord(parsed.naturalBreakCredit, 'ActiveUsage.naturalBreakCredit');
      const protocolBreak =
        parsed.protocolBreakCredit == null
          ? null
          : requireRecord(parsed.protocolBreakCredit, 'ActiveUsage.protocolBreakCredit');
      return createActiveUsageTrigger({
        requiredActiveMs: requireNumber(parsed.requiredActiveMs, 'ActiveUsage.requiredActiveMs'),
        anchor: requireActiveUsageAnchor(parsed.anchor),
        naturalBreakCredit:
          naturalBreak == null
            ? null
            : {
                idleDurationMs: requireNumber(
                  naturalBreak.idleDurationMs,
                  'ActiveUsage.naturalBreakCredit.idleDurationMs',
                ),
              },
        protocolBreakCredit:
          protocolBreak == null
            ? null
            : {
                kind: requireRoutineBreakCreditKind(protocolBreak.kind),
                minimumBreakMs: requireNumber(
                  protocolBreak.minimumBreakMs,
                  'ActiveUsage.protocolBreakCredit.minimumBreakMs',
                ),
              },
      });
    }
    default:
      throw new TypeError(`Unsupported persisted RoutineTrigger type: ${parsed.type}`);
  }
}

/**
 * Snooze/temporary override is runtime state, not RoutineDefinition config.
 * W4 persists this payload in its runtime-state table; this codec is fixed in W2.
 */
export function serializeRoutineTemporaryOverride(
  override: RoutineTemporaryOverride | null,
): string | null {
  return override == null ? null : JSON.stringify(override);
}

export function deserializeRoutineTemporaryOverride(
  raw: string | null,
): RoutineTemporaryOverride | null {
  if (raw == null) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new TypeError('Invalid persisted RoutineTemporaryOverride');
  return createTemporaryOverride({
    snoozeUntil: nullableInstant(parsed.snoozeUntil, 'snoozeUntil'),
    suppressUntil: nullableInstant(parsed.suppressUntil, 'suppressUntil'),
    overrideIntervalMs:
      parsed.overrideIntervalMs == null
        ? null
        : requireNumber(parsed.overrideIntervalMs, 'overrideIntervalMs'),
    expiresAt: requireNumber(parsed.expiresAt, 'expiresAt') as Instant,
    reason: requireString(parsed.reason, 'reason'),
    source: requireOverrideSource(parsed.source),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${field} must be an object`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number`);
  }
  return value;
}

function nullableInstant(value: unknown, field: string): number | null {
  return value == null ? null : requireNumber(value, field);
}

function requireRecurrenceFrequency(value: unknown): 'daily' | 'weekly' | 'monthly' | 'yearly' {
  if (value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'yearly')
    return value;
  throw new TypeError('WallClock.recurrence.frequency is invalid');
}

function requireWeekdays(value: unknown): Array<0 | 1 | 2 | 3 | 4 | 5 | 6> {
  if (!Array.isArray(value)) throw new TypeError('WallClock.recurrence.byWeekday must be an array');
  return value.map((item) => {
    const weekday = requireNumber(item, 'WallClock.recurrence.byWeekday[]');
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new TypeError('WallClock.recurrence.byWeekday[] is invalid');
    }
    return weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  });
}

function requireElapsedAnchor(
  value: unknown,
): 'routine-activation' | 'profile-activation' | 'last-satisfied' {
  if (
    value === 'routine-activation' ||
    value === 'profile-activation' ||
    value === 'last-satisfied'
  )
    return value;
  throw new TypeError('Elapsed.anchor is invalid');
}

function requireActiveUsageAnchor(value: unknown): 'profile-activation' | 'last-satisfied' {
  if (value === 'profile-activation' || value === 'last-satisfied') return value;
  throw new TypeError('ActiveUsage.anchor is invalid');
}

function requireRoutineBreakCreditKind(value: unknown): 'Stand' | 'Eye' | 'Movement' {
  if (value === 'Stand' || value === 'Eye' || value === 'Movement') return value;
  throw new TypeError('ActiveUsage.protocolBreakCredit.kind is invalid');
}

function requireOverrideSource(value: unknown): 'user' | 'ai' | 'runtime' {
  if (value === 'user' || value === 'ai' || value === 'runtime') return value;
  throw new TypeError('TemporaryOverride.source is invalid');
}
