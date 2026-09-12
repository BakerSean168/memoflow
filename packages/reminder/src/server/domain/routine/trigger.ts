import {
  asInstant,
  createTimeContext,
  createTimeFacade,
  isIanaTimeZoneId,
  type Hm,
  type Instant,
  type RecurrenceEnginePort,
  type RecurrenceFrequency,
  type RecurrenceSchedule,
  type RecurrenceWeekday,
  type TimeZoneId,
  type Ymd,
} from '@memoflow/time';
import type { FixedTimeTrigger, IntervalTrigger } from '@memoflow/contracts/reminder';

/**
 * Timing truth is explicit in the trigger type itself.
 *
 * WallClock -> durable Scheduler (projection is Wave 3)
 * Elapsed / ActiveUsage -> deterministic desktop/local runtime (Wave 4)
 */
export type RoutineTimingOwner = 'scheduler' | 'local-runtime';

export const ROUTINE_TRIGGER_TYPES = ['WallClock', 'Elapsed', 'ActiveUsage'] as const;
export type RoutineTriggerType = (typeof ROUTINE_TRIGGER_TYPES)[number];

export interface WallClockRecurrence {
  startDate: Ymd;
  frequency: RecurrenceFrequency;
  interval: number;
  byWeekday: readonly RecurrenceWeekday[];
  count: number | null;
  until: Instant | null;
}

export interface WallClockTrigger {
  type: 'WallClock';
  timingOwner: 'scheduler';
  localTime: Hm;
  timeZone: TimeZoneId;
  recurrence: WallClockRecurrence;
}

export type ElapsedAnchor = 'routine-activation' | 'profile-activation' | 'last-satisfied';

export interface ElapsedTrigger {
  type: 'Elapsed';
  timingOwner: 'local-runtime';
  durationMs: number;
  anchor: ElapsedAnchor;
}

export type ActiveUsageAnchor = 'profile-activation' | 'last-satisfied';

export const ROUTINE_BREAK_CREDIT_KINDS = ['Stand', 'Eye', 'Movement'] as const;
export type RoutineBreakCreditKind = (typeof ROUTINE_BREAK_CREDIT_KINDS)[number];

export interface ActiveUsageTrigger {
  type: 'ActiveUsage';
  timingOwner: 'local-runtime';
  requiredActiveMs: number;
  anchor: ActiveUsageAnchor;
  /**
   * W4 consumes this policy using ActivitySensor/IdleSensor. W2 only owns the
   * deterministic business contract; it does not implement desktop sensing.
   */
  naturalBreakCredit: {
    idleDurationMs: number;
    effect: 'satisfy-and-reset';
  } | null;
  /**
   * Explicit semantic compatibility with completed protocol breaks. This is
   * persisted inside trigger_json so local runtimes never infer capability or
   * minimum acceptable break duration from a routine name.
   */
  protocolBreakCredit: {
    kind: RoutineBreakCreditKind;
    minimumBreakMs: number;
  } | null;
}

export type RoutineTrigger = WallClockTrigger | ElapsedTrigger | ActiveUsageTrigger;

export interface CreateWallClockTriggerInput {
  localTime: string;
  timeZone: string;
  recurrence: {
    startDate: string;
    frequency: RecurrenceFrequency;
    interval?: number;
    byWeekday?: readonly RecurrenceWeekday[];
    count?: number | null;
    until?: Instant | number | null;
  };
}

export function createWallClockTrigger(input: CreateWallClockTriggerInput): WallClockTrigger {
  if (!isIanaTimeZoneId(input.timeZone)) {
    throw new TypeError(`Invalid IANA time zone: ${input.timeZone}`);
  }
  // WallClock owns an explicit schedule timezone snapshot. Parsing its Hm/Ymd
  // values must never instantiate the host-local default facade.
  const scheduleTime = createTimeFacade({
    context: createTimeContext({ timeZone: input.timeZone, weekStartsOn: 1 }),
  });
  const localTime = scheduleTime.input.parseTimeValue(input.localTime);
  if (localTime == null) {
    throw new TypeError(`Invalid local time: ${input.localTime}`);
  }
  const startDate = scheduleTime.input.parseDateValue(input.recurrence.startDate);
  if (startDate == null) {
    throw new TypeError(`Invalid recurrence start date: ${input.recurrence.startDate}`);
  }

  const interval = input.recurrence.interval ?? 1;
  assertPositiveInteger(interval, 'recurrence.interval');
  const count = input.recurrence.count ?? null;
  if (count != null) assertPositiveInteger(count, 'recurrence.count');

  const byWeekday = [...(input.recurrence.byWeekday ?? [])];
  for (const weekday of byWeekday) {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new TypeError(`Invalid recurrence weekday: ${weekday}`);
    }
  }

  const until = normalizeInstant(input.recurrence.until ?? null, 'recurrence.until');
  return {
    type: 'WallClock',
    timingOwner: 'scheduler',
    localTime,
    timeZone: input.timeZone,
    recurrence: {
      startDate,
      frequency: input.recurrence.frequency,
      interval,
      byWeekday,
      count,
      until,
    },
  };
}

export function createElapsedTrigger(input: {
  durationMs: number;
  anchor?: ElapsedAnchor;
}): ElapsedTrigger {
  assertPositiveFinite(input.durationMs, 'durationMs');
  return {
    type: 'Elapsed',
    timingOwner: 'local-runtime',
    durationMs: input.durationMs,
    anchor: input.anchor ?? 'last-satisfied',
  };
}

export function createActiveUsageTrigger(input: {
  requiredActiveMs: number;
  anchor?: ActiveUsageAnchor;
  naturalBreakCredit?: {
    idleDurationMs: number;
  } | null;
  protocolBreakCredit?: {
    kind: RoutineBreakCreditKind;
    minimumBreakMs: number;
  } | null;
}): ActiveUsageTrigger {
  assertPositiveFinite(input.requiredActiveMs, 'requiredActiveMs');
  if (input.naturalBreakCredit) {
    assertPositiveFinite(
      input.naturalBreakCredit.idleDurationMs,
      'naturalBreakCredit.idleDurationMs',
    );
  }
  if (input.protocolBreakCredit) {
    if (!ROUTINE_BREAK_CREDIT_KINDS.includes(input.protocolBreakCredit.kind)) {
      throw new TypeError(`Invalid protocol break credit kind: ${input.protocolBreakCredit.kind}`);
    }
    assertPositiveFinite(
      input.protocolBreakCredit.minimumBreakMs,
      'protocolBreakCredit.minimumBreakMs',
    );
  }
  return {
    type: 'ActiveUsage',
    timingOwner: 'local-runtime',
    requiredActiveMs: input.requiredActiveMs,
    anchor: input.anchor ?? 'last-satisfied',
    naturalBreakCredit: input.naturalBreakCredit
      ? {
          idleDurationMs: input.naturalBreakCredit.idleDurationMs,
          effect: 'satisfy-and-reset',
        }
      : null,
    protocolBreakCredit: input.protocolBreakCredit ? { ...input.protocolBreakCredit } : null,
  };
}

export function toRecurrenceSchedule(trigger: WallClockTrigger): RecurrenceSchedule {
  return {
    ...trigger.recurrence,
    localTime: trigger.localTime,
    timeZone: trigger.timeZone,
  };
}

/** WallClock recurrence calculation is exclusively delegated to Wave 1's port. */
export function nextWallClockOccurrence(
  engine: RecurrenceEnginePort,
  trigger: WallClockTrigger,
  after: Instant,
  inclusive = false,
): Instant | null {
  return engine.next(toRecurrenceSchedule(trigger), after, inclusive);
}

export function wallClockOccurrencesBetween(
  engine: RecurrenceEnginePort,
  trigger: WallClockTrigger,
  range: { from: Instant; to: Instant; inclusive?: boolean },
): Instant[] {
  return engine.between(toRecurrenceSchedule(trigger), range);
}

export function requiresDurableScheduleProjection(
  trigger: RoutineTrigger,
): trigger is WallClockTrigger {
  return trigger.type === 'WallClock';
}

export function timingOwnerOf(trigger: RoutineTrigger): RoutineTimingOwner {
  return trigger.timingOwner;
}

export type TemporaryOverrideSource = 'user' | 'ai' | 'runtime';

/**
 * Temporary state is separate from long-lived trigger configuration.
 * Snooze/suppress therefore never rewrite WallClock.localTime or interval.
 */
export interface RoutineTemporaryOverride {
  snoozeUntil: Instant | null;
  suppressUntil: Instant | null;
  overrideIntervalMs: number | null;
  expiresAt: Instant;
  reason: string;
  source: TemporaryOverrideSource;
}

export function createTemporaryOverride(input: {
  snoozeUntil?: Instant | number | null;
  suppressUntil?: Instant | number | null;
  overrideIntervalMs?: number | null;
  expiresAt: Instant | number;
  reason: string;
  source: TemporaryOverrideSource;
}): RoutineTemporaryOverride {
  const reason = input.reason.trim();
  if (!reason) throw new TypeError('TemporaryOverride reason must not be empty');
  if (input.overrideIntervalMs != null) {
    assertPositiveFinite(input.overrideIntervalMs, 'overrideIntervalMs');
  }
  const expiresAt = normalizeInstant(input.expiresAt, 'expiresAt');
  if (expiresAt == null) throw new TypeError('expiresAt is required');
  const snoozeUntil = normalizeInstant(input.snoozeUntil ?? null, 'snoozeUntil');
  const suppressUntil = normalizeInstant(input.suppressUntil ?? null, 'suppressUntil');
  if (snoozeUntil != null && Number(snoozeUntil) > Number(expiresAt)) {
    throw new TypeError('snoozeUntil must not exceed expiresAt');
  }
  if (suppressUntil != null && Number(suppressUntil) > Number(expiresAt)) {
    throw new TypeError('suppressUntil must not exceed expiresAt');
  }
  if (snoozeUntil == null && suppressUntil == null && input.overrideIntervalMs == null) {
    throw new TypeError('TemporaryOverride must define at least one temporary effect');
  }
  return {
    snoozeUntil,
    suppressUntil,
    overrideIntervalMs: input.overrideIntervalMs ?? null,
    expiresAt,
    reason,
    source: input.source,
  };
}

export function createSnoozeOverride(input: {
  now: Instant | number;
  durationMs: number;
  reason: string;
  source?: TemporaryOverrideSource;
}): RoutineTemporaryOverride {
  assertPositiveFinite(input.durationMs, 'durationMs');
  const now = normalizeInstant(input.now, 'now');
  if (now == null) throw new TypeError('now is required');
  const snoozeUntil = asInstant(Number(now) + input.durationMs);
  return createTemporaryOverride({
    snoozeUntil,
    expiresAt: snoozeUntil,
    reason: input.reason,
    source: input.source ?? 'user',
  });
}

/**
 * Canonical gate contribution consumed by evaluateRoutineEffectiveEnabled.
 * Expired overrides are neutral. Active snooze/suppress closes the gate.
 */
export function temporaryOverrideAllowsExecution(
  override: RoutineTemporaryOverride | null,
  now: Instant,
): boolean {
  if (!override) return true;
  const nowMs = Number(now);
  if (nowMs >= Number(override.expiresAt)) return true;
  if (override.snoozeUntil != null && nowMs < Number(override.snoozeUntil)) return false;
  if (override.suppressUntil != null && nowMs < Number(override.suppressUntil)) return false;
  return true;
}

export interface LegacyIntervalMigration {
  target: 'Elapsed' | 'ActiveUsage';
  trigger: ElapsedTrigger | ActiveUsageTrigger;
  /** Legacy startTime is runtime state, not long-lived trigger configuration. */
  legacyAnchorInstant: Instant | null;
  rationale: string;
}

/**
 * ADR-059 characterizes legacy Interval as wall-clock elapsed. ActiveUsage is
 * selected only when migration evidence explicitly proves that intent.
 */
export function migrateLegacyIntervalTrigger(
  legacy: IntervalTrigger,
  options: {
    semanticEvidence?: 'elapsed' | 'active-usage';
    elapsedAnchor?: ElapsedAnchor;
    activeUsageAnchor?: ActiveUsageAnchor;
    naturalBreakCreditMs?: number | null;
    /** Actual legacy runtime recurrence base; Reminder uses activeTime.activatedAt. */
    legacyAnchorInstant?: Instant | number | null;
  } = {},
): LegacyIntervalMigration {
  assertPositiveFinite(legacy.minutes, 'legacy interval minutes');
  const durationMs = legacy.minutes * 60_000;
  const legacyAnchorInstant = normalizeInstant(
    options.legacyAnchorInstant !== undefined ? options.legacyAnchorInstant : legacy.startTime,
    'legacy interval runtime anchor',
  );

  if (options.semanticEvidence === 'active-usage') {
    return {
      target: 'ActiveUsage',
      trigger: createActiveUsageTrigger({
        requiredActiveMs: durationMs,
        anchor: options.activeUsageAnchor,
        naturalBreakCredit:
          options.naturalBreakCreditMs == null
            ? null
            : { idleDurationMs: options.naturalBreakCreditMs },
      }),
      legacyAnchorInstant,
      rationale: 'Explicit migration evidence identifies true active-computer usage semantics.',
    };
  }

  return {
    target: 'Elapsed',
    trigger: createElapsedTrigger({ durationMs, anchor: options.elapsedAnchor }),
    legacyAnchorInstant,
    rationale:
      options.semanticEvidence === 'elapsed'
        ? 'Explicit migration evidence confirms elapsed-time semantics.'
        : 'ADR-059 characterizes legacy Interval as wall-clock elapsed; no ActiveUsage evidence was provided.',
  };
}

/**
 * FixedTime carries local clock time only; recurrence context comes from the
 * enclosing legacy Routine/Reminder. Null legacy timezone is the old contract's
 * explicit UTC default, never a host-local/fixed-city fallback.
 */
export function migrateLegacyFixedTimeTrigger(input: {
  legacy: FixedTimeTrigger;
  recurrence: CreateWallClockTriggerInput['recurrence'];
}): WallClockTrigger {
  return createWallClockTrigger({
    localTime: input.legacy.time,
    timeZone: input.legacy.timezone ?? 'UTC',
    recurrence: input.recurrence,
  });
}

function normalizeInstant(value: Instant | number | null, field: string): Instant | null {
  if (value == null) return null;
  if (!Number.isFinite(Number(value))) {
    throw new TypeError(`${field} must be a finite epoch-ms Instant`);
  }
  return asInstant(Number(value));
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive integer`);
  }
}

function assertPositiveFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive finite number`);
  }
}
