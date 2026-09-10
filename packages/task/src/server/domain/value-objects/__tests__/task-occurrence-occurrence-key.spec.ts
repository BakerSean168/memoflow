import { describe, expect, it } from 'vitest';
import { createTimeContext, createTimeFacade } from '@memoflow/time';
import {
  buildTaskOccurrenceOccurrenceKey,
  startOfLocalDay,
  toLocalDateKey,
} from '../task-occurrence-occurrence-key';

const UTC = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const NEW_YORK = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });

describe('task instance occurrence key (R2-1 / TIME-1206)', () => {
  it('is deterministic for the same template and explicit calendar day', () => {
    const now = Date.parse('2026-06-20T12:30:00.000Z');
    const a = buildTaskOccurrenceOccurrenceKey('tpl-1', startOfLocalDay(now, UTC), UTC);
    const b = buildTaskOccurrenceOccurrenceKey('tpl-1', now, UTC);
    expect(a).toBe(b);
    expect(a).toBe('tpl-1:2026-06-20');
  });

  it('differs across templates and across calendar days', () => {
    const time = createTimeFacade({ context: UTC });
    const day1 = startOfLocalDay(Date.parse('2026-06-20T12:00:00.000Z'), UTC);
    const day2 = startOfLocalDay(Number(time.calendar.addDays(day1, 1)), UTC);
    expect(buildTaskOccurrenceOccurrenceKey('tpl-1', day1, UTC)).not.toBe(
      buildTaskOccurrenceOccurrenceKey('tpl-2', day1, UTC),
    );
    expect(buildTaskOccurrenceOccurrenceKey('tpl-1', day1, UTC)).not.toBe(
      buildTaskOccurrenceOccurrenceKey('tpl-1', day2, UTC),
    );
  });

  it('uses the supplied identity timezone instead of host/UTC day boundaries', () => {
    const instant = Date.parse('2026-03-08T04:30:00.000Z');
    expect(buildTaskOccurrenceOccurrenceKey('tpl-1', instant, NEW_YORK)).toBe('tpl-1:2026-03-07');
    expect(toLocalDateKey(instant, NEW_YORK)).toBe('2026-03-07');
    expect(buildTaskOccurrenceOccurrenceKey('tpl-1', instant, UTC)).toBe('tpl-1:2026-03-08');
  });
});
