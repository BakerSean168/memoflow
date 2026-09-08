import { describe, expect, it } from 'vitest';
import { createTimeFacade } from '@memoflow/time';

const taskTime = createTimeFacade();
import {
  buildTaskOccurrenceOccurrenceKey,
  startOfLocalDay,
  toLocalDateKey,
} from '../task-occurrence-occurrence-key';

describe('task instance occurrence key (R2-1)', () => {
  it('is deterministic for the same template and local day', () => {
    const a = buildTaskOccurrenceOccurrenceKey('tpl-1', startOfLocalDay(Date.now()));
    const b = buildTaskOccurrenceOccurrenceKey('tpl-1', Date.now());
    // 同一天内任何时刻 → 相同 key（本地时区，非 UTC）。
    expect(a).toBe(b);
    expect(a).toMatch(/^tpl-1:\d{4}-\d{2}-\d{2}$/);
  });

  it('differs across templates and across days', () => {
    const day1 = startOfLocalDay(Date.now());
    const day2 = startOfLocalDay(taskTime.calendar.addDays(day1, 1));
    expect(buildTaskOccurrenceOccurrenceKey('tpl-1', day1)).not.toBe(
      buildTaskOccurrenceOccurrenceKey('tpl-2', day1),
    );
    expect(buildTaskOccurrenceOccurrenceKey('tpl-1', day1)).not.toBe(
      buildTaskOccurrenceOccurrenceKey('tpl-1', day2),
    );
  });

  it('uses the local calendar day (not UTC) so DST does not split one day', () => {
    // 本地时区 2026-06-20 20:00 在 UTC 可能是 2026-06-21；key 必须取本地日期。
    const localEvening = new Date(2026, 5, 20, 20, 0, 0).getTime();
    const key = buildTaskOccurrenceOccurrenceKey('tpl-1', localEvening);
    expect(key).toBe('tpl-1:2026-06-20');
    expect(toLocalDateKey(localEvening)).toBe('2026-06-20');
  });
});
