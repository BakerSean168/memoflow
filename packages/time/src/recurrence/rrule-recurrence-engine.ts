import * as rruleNamespace from 'rrule';
import type { Options, Weekday } from 'rrule';
import { asHm, asYmd, isHmShape, isYmdShape } from '../codec/brand';
import { combineYmdHmWithTimeZone } from '../timezone/wall-clock';
import { isIanaTimeZoneId } from '../timezone/time-zone';
import type { Instant } from '../types';
import type {
  RecurrenceEnginePort,
  RecurrenceFrequency,
  RecurrenceSchedule,
  RecurrenceWeekday,
} from './recurrence-engine.port';

type RRuleConstructor = typeof import('rrule').RRule;
type RRuleRuntimeNamespace = {
  RRule?: RRuleConstructor;
  default?: { RRule?: RRuleConstructor };
};

function resolveRRuleConstructor(): RRuleConstructor {
  const runtime = rruleNamespace as unknown as RRuleRuntimeNamespace;
  const constructor = runtime.RRule ?? runtime.default?.RRule;
  if (constructor == null) {
    throw new TypeError('rrule runtime does not expose RRule');
  }
  return constructor;
}

const RRule = resolveRRuleConstructor();

const FREQUENCY_MAP: Record<RecurrenceFrequency, number> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
};

const WEEKDAY_MAP: Record<RecurrenceWeekday, Weekday> = {
  0: RRule.SU,
  1: RRule.MO,
  2: RRule.TU,
  3: RRule.WE,
  4: RRule.TH,
  5: RRule.FR,
  6: RRule.SA,
};

function floatingWallDate(schedule: RecurrenceSchedule): Date {
  const [year, month, day] = schedule.startDate.split('-').map(Number);
  const [hour, minute] = schedule.localTime.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
}

function zonedParts(
  instant: Instant,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const bag: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(instant))) {
    if (part.type !== 'literal') bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

/**
 * Convert an absolute boundary to rrule's floating UTC-shaped calendar space.
 * We intentionally do not use rrule's TZID implementation: product zone semantics
 * remain owned by ADR-037 and are stable across CJS/ESM/host timezone differences.
 */
function instantToFloatingDate(instant: Instant, timeZone: string): Date {
  const parts = zonedParts(instant, timeZone);
  const millis = ((instant % 1000) + 1000) % 1000;
  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      millis,
    ),
  );
}

function floatingDateToInstant(date: Date, timeZone: string): Instant {
  const ymd = asYmd(
    `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`,
  );
  const hm = asHm(
    `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`,
  );
  const resolved = combineYmdHmWithTimeZone(ymd, hm, timeZone);
  if (resolved == null) {
    throw new TypeError(`Unable to resolve recurrence wall time ${ymd} ${hm} in ${timeZone}`);
  }
  return resolved;
}

function assertSchedule(schedule: RecurrenceSchedule): void {
  if (!isYmdShape(schedule.startDate)) {
    throw new TypeError(`Invalid recurrence startDate: ${schedule.startDate}`);
  }
  if (!isHmShape(schedule.localTime)) {
    throw new TypeError(`Invalid recurrence localTime: ${schedule.localTime}`);
  }
  if (!isIanaTimeZoneId(schedule.timeZone)) {
    throw new TypeError(`Invalid recurrence timeZone: ${schedule.timeZone}`);
  }
  if (!Number.isInteger(schedule.interval) || schedule.interval < 1) {
    throw new TypeError(`Recurrence interval must be a positive integer: ${schedule.interval}`);
  }
  if (schedule.frequency === 'weekly' && schedule.byWeekday.length === 0) {
    throw new TypeError('Weekly recurrence requires at least one byWeekday value');
  }
  if (schedule.count != null && (!Number.isInteger(schedule.count) || schedule.count < 1)) {
    throw new TypeError(`Recurrence count must be a positive integer: ${schedule.count}`);
  }
  if (schedule.until != null && !Number.isFinite(schedule.until)) {
    throw new TypeError(`Recurrence until must be a finite Instant: ${String(schedule.until)}`);
  }
}

function toOptions(schedule: RecurrenceSchedule): Partial<Options> {
  assertSchedule(schedule);
  return {
    freq: FREQUENCY_MAP[schedule.frequency],
    dtstart: floatingWallDate(schedule),
    interval: schedule.interval,
    // Match MemoFlow's existing Monday-based calendar-week semantics.
    wkst: RRule.MO,
    byweekday:
      schedule.frequency === 'weekly'
        ? schedule.byWeekday.map((weekday) => WEEKDAY_MAP[weekday])
        : null,
    count: schedule.count,
    until: schedule.until == null ? null : instantToFloatingDate(schedule.until, schedule.timeZone),
    // Keep rrule in floating calendar space; ADR-037 owns IANA conversion.
    tzid: null,
  };
}

/** rrule@2.8.1 adapter. Third-party types terminate in this file. */
export function createRRuleRecurrenceEngine(): RecurrenceEnginePort {
  return {
    between(schedule, range) {
      if (!Number.isFinite(range.from) || !Number.isFinite(range.to) || range.from > range.to) {
        throw new TypeError('Invalid recurrence range');
      }
      const rule = new RRule(toOptions(schedule));
      const occurrences = rule.between(
        instantToFloatingDate(range.from, schedule.timeZone),
        instantToFloatingDate(range.to, schedule.timeZone),
        range.inclusive ?? true,
      );
      return occurrences
        .map((date) => floatingDateToInstant(date, schedule.timeZone))
        .filter((value) => value >= range.from && value <= range.to);
    },

    next(schedule, after, inclusive = false) {
      if (!Number.isFinite(after)) {
        throw new TypeError(`Invalid recurrence boundary: ${String(after)}`);
      }
      const rule = new RRule(toOptions(schedule));
      const next = rule.after(instantToFloatingDate(after, schedule.timeZone), inclusive);
      return next == null ? null : floatingDateToInstant(next, schedule.timeZone);
    },
  };
}
