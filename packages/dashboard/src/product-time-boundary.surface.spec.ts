import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFixedClock, createTimeContext, createTimeFacade } from '@memoflow/time';

/**
 * Product Time convergence lock.
 * Dashboard and React agenda must derive calendar-day boundaries from explicit
 * Product Time, never from host-local Date/setHours semantics.
 */
describe('dashboard Product Time boundary', () => {
  const dir = __dirname;
  const projection = readFileSync(resolve(dir, 'domain/projection.ts'), 'utf8');
  const agenda = readFileSync(resolve(dir, '../../app-react/src/hooks/useScheduleAgenda.ts'), 'utf8');

  it('dashboard projection uses explicit TimeContext and Product Time calendar APIs', () => {
    expect(projection).toContain("from '@memoflow/time'");
    expect(projection).toContain('createTimeFacade({ context: timeContext })');
    expect(projection).toContain('time.calendar.startOfDay(now)');
    expect(projection).toContain('time.calendar.endOfDay(now)');
    expect(projection).not.toContain('setHours(0, 0, 0, 0)');
    expect(projection).not.toMatch(/new Date\(/);
  });

  it('React agenda also uses Product Time instead of a local Date startOfDay helper', () => {
    expect(agenda).toContain("from '../utils/product-time'");
    expect(agenda).toContain('getProductTime().calendar.toYmd(timestamp)');
    expect(agenda).toContain('time.calendar.startOfDay');
    expect(agenda).not.toMatch(/function startOfDay/);
    expect(agenda).not.toContain('setHours(0, 0, 0, 0)');
  });

  it('resolves DST calendar boundaries in the supplied user timezone', () => {
    const context = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
    const now = Date.parse('2026-03-08T16:00:00.000Z');
    const time = createTimeFacade({ context, clock: createFixedClock(now) });
    const start = Number(time.calendar.startOfDay(now));
    const end = Number(time.calendar.endOfDay(now));

    expect(new Date(start).toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(new Date(end).toISOString()).toBe('2026-03-09T03:59:59.999Z');
    expect(String(time.calendar.toYmd(now))).toBe('2026-03-08');
  });
});
