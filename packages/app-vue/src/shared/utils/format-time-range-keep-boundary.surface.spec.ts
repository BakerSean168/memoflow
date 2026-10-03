import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { setProductTimePreferences } from './product-time';
import { formatCalendarEventTimeRange } from './format-calendar-event-time-range';

/**
 * TIME-1205 / Planner projection presentation boundary.
 *
 * app-react keeps its compact HH:mm pair helper. The production Vue Planner now
 * renders canonical CalendarEventProjection values through planner-presentation
 * instead of first reshaping them into the legacy CalendarEventItem detail model.
 */
describe('schedule time-range presentation boundary', () => {
  afterEach(() => setProductTimePreferences(createDefaultUserPreferenceProfile()));
  const dir = __dirname;
  const react = readFileSync(
    resolve(dir, '../../../../app-react/src/hooks/useScheduleAgenda.ts'),
    'utf8',
  );
  const dayDetail = readFileSync(
    resolve(dir, '../../modules/schedule/components/PlannerDayDialog.vue'),
    'utf8',
  );
  const eventDetail = readFileSync(
    resolve(dir, '../../modules/schedule/components/PlannerEventDialog.vue'),
    'utf8',
  );
  const plannerPresentation = readFileSync(
    resolve(dir, '../../modules/schedule/planner/planner-presentation.ts'),
    'utf8',
  );
  const legacy = readFileSync(resolve(dir, 'format-calendar-event-time-range.ts'), 'utf8');

  it('locks app-react formatTimeRange onto canonical session Product Time', () => {
    expect(react).toContain('Canonical Product Time projection');
    expect(react).toMatch(/function formatTimeRange\b/);
    expect(react).toContain('startTime: number, endTime: number');
    expect(react).toContain('getProductTime');
    const body = react.match(/function formatTimeRange\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('time.format.hm');
    expect(body).toContain(' - ');
    expect(body).not.toContain('Intl.DateTimeFormat');
    expect(body).not.toContain('zh-CN');
    expect(body).not.toContain('padStart');
  });

  it('keeps the production Vue Planner on CalendarEventProjection presentation', () => {
    expect(plannerPresentation).toContain('CalendarEventProjection');
    expect(plannerPresentation).toContain('formatPlannerProjectionTimeRange');
    expect(plannerPresentation).toContain('time.format.ymdDisplay');
    expect(plannerPresentation).toContain('time.format.pattern');
    expect(plannerPresentation).toContain('–');
    expect(plannerPresentation).not.toContain('CalendarEventItem');
    expect(plannerPresentation).not.toContain('Intl.DateTimeFormat');

    for (const consumer of [dayDetail, eventDetail]) {
      expect(consumer).toContain('planner-presentation');
      expect(consumer).toContain('formatPlannerProjectionTimeRange');
      expect(consumer).not.toContain('CalendarEventItem');
      expect(consumer).not.toContain('format-calendar-event-time-range');
    }
  });

  it('retains the legacy CalendarEventItem formatter as an isolated compatibility helper', () => {
    expect(legacy).toContain('Residual 1273');
    expect(legacy).toContain("displayMode === 'all-day'");
    expect(legacy).toContain('getProductTime');
    expect(legacy).toContain('–');
    expect(legacy).not.toContain('Intl.DateTimeFormat');
  });

  it('formats the legacy event range in the session timezone across DST', () => {
    const profile = createDefaultUserPreferenceProfile();
    setProductTimePreferences({
      ...profile,
      regional: { ...profile.regional, timeZone: 'America/New_York' },
    });

    expect(
      formatCalendarEventTimeRange(
        {
          displayMode: 'timed',
          startTime: Date.parse('2026-03-08T13:05:00.000Z'),
          endTime: Date.parse('2026-03-08T14:30:00.000Z'),
        },
        'All day',
      ),
    ).toBe('09:05 – 10:30');
  });

  it('preserves the legacy all-day compatibility contract', () => {
    const start = Date.UTC(2024, 0, 2, 9, 0, 0);
    const end = Date.UTC(2024, 0, 2, 10, 30, 0);
    expect(
      formatCalendarEventTimeRange(
        { displayMode: 'all-day', startTime: start, endTime: end },
        'All day',
      ),
    ).toBe('All day');
  });
});
