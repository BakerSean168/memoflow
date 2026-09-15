import type { TaskTiming } from '@memoflow/contracts/task';
import { TaskTimingKind } from '@memoflow/contracts/task';
import type { Instant, Ymd } from '@memoflow/contracts/primitives';
import { asHm, combineYmdHmWithTimeZone, createTimeFacade, type TimeContext } from '@memoflow/time';

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
