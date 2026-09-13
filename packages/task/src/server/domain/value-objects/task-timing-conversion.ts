import type { TaskTiming } from '@memoflow/contracts/task';
import { TaskTimingKind } from '@memoflow/contracts/task';
import type { Instant, Ymd } from '@memoflow/contracts/primitives';
import { asHm, combineYmdHmWithTimeZone, createTimeFacade, type TimeContext } from '@memoflow/time';
import { TaskTimeConfig } from './task-time-config';

function minutesToHm(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return asHm(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`);
}

function hmToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function taskTimingFromLegacy(config: TaskTimeConfig): TaskTiming {
  if (config.isAllDay) return { kind: TaskTimingKind.AllDay };
  if (config.isTimePoint) {
    if (config.timePoint == null) throw new Error('TimePoint schedule requires a time');
    return { kind: TaskTimingKind.At, time: minutesToHm(config.timePoint) };
  }
  const range = config.timeRange;
  if (!range) throw new Error('TimeRange schedule requires a window');
  return {
    kind: TaskTimingKind.Window,
    start: minutesToHm(range.start),
    end: minutesToHm(range.end),
  };
}

export function taskTimingToLegacy(
  timing: TaskTiming,
  date: Ymd,
  timeContext: TimeContext,
): TaskTimeConfig {
  const facade = createTimeFacade({ context: timeContext });
  const ymd = facade.codec.parseYmd(date, { onInvalid: 'throw' });
  if (!ymd) throw new Error(`Invalid Task schedule date: ${date}`);
  const anchor = facade.codec.startOfYmd(ymd);
  if (timing.kind === TaskTimingKind.AllDay) return TaskTimeConfig.createAllDay(anchor);
  if (timing.kind === TaskTimingKind.At) {
    return TaskTimeConfig.createTimePoint(anchor, hmToMinutes(timing.time));
  }
  return TaskTimeConfig.createTimeRange(anchor, hmToMinutes(timing.start), hmToMinutes(timing.end));
}

export function taskTimingDueAt(timing: TaskTiming, date: Ymd, timeContext: TimeContext): Instant {
  const facade = createTimeFacade({ context: timeContext });
  const ymd = facade.codec.parseYmd(date, { onInvalid: 'throw' });
  if (!ymd) throw new Error(`Invalid Task occurrence date: ${date}`);
  if (timing.kind === TaskTimingKind.AllDay) {
    return facade.calendar.endOfDay(facade.codec.startOfYmd(ymd));
  }
  const hm = timing.kind === TaskTimingKind.At ? timing.time : timing.end;
  const resolved = combineYmdHmWithTimeZone(date, asHm(hm), facade.context.timeZone);
  if (resolved == null) {
    throw new Error(`Task occurrence time does not resolve in :  `);
  }
  return resolved;
}
