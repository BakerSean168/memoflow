import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { setProductTimePreferences } from './product-time';
import { formatCalendarEventTimeRange } from './format-calendar-event-time-range';

/**
 * TIME-1205: formatTimeRange keep-boundary (app-react Product Time pair vs app-vue event/all-day).
 * - app-react useScheduleAgenda: (startTime, endTime) → session Product Time HH:mm pair + " - "
 * - app-vue event/all-day shape lives in formatCalendarEventTimeRange sole (Residual 1273 dual-retired)
 * Soft residual 1213 / Residual 1273: DayDetailSheet + TaskEventActionPanel dual-retired onto sole.
 * Soft residual 1210: formatDateToInput keep-boundary remains separate.
 * TIME-1205: vue sole inner HH:mm uses the session Product Time facade (en-dash stays separate).
 * Does not flip §13.2 checkboxes.
 */
describe('formatTimeRange keep-boundary (residual 1213)', () => {
  afterEach(() => setProductTimePreferences(createDefaultUserPreferenceProfile()));
  const dir = __dirname;
  const react = readFileSync(
    resolve(dir, '../../../../app-react/src/hooks/useScheduleAgenda.ts'),
    'utf8',
  );
  const vue = readFileSync(
    resolve(dir, '../../modules/schedule/components/DayDetailSheet.vue'),
    'utf8',
  );
  const panel = readFileSync(
    resolve(dir, '../../modules/schedule/components/TaskEventActionPanel.vue'),
    'utf8',
  );
  const sole = readFileSync(resolve(dir, 'format-calendar-event-time-range.ts'), 'utf8');

  it('locks app-react formatTimeRange onto canonical session Product Time', () => {
    expect(react).toContain('Canonical Product Time projection');
    expect(react).toMatch(/function formatTimeRange\b/);
    expect(react).toContain('startTime: number, endTime: number');
    expect(react).toContain('getProductTime');
    const body = react.match(/function formatTimeRange\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('time.format.hm');
    expect(body).toContain(' - ');
    expect(body).not.toContain('all-day');
    expect(body).not.toContain('CalendarEventItem');
    expect(body).not.toContain('Intl.DateTimeFormat');
    expect(body).not.toContain('zh-CN');
    expect(body).not.toContain('padStart');
  });

  it('differs from app-vue event/all-day sole shape (no force-merge)', () => {
    expect(vue).toContain('Residual 1213 keep-boundary');
    expect(vue).toContain('Soft residual 1213');
    expect(vue).toContain('CalendarEventItem');
    expect(sole).toContain('Residual 1273');
    expect(sole).toContain('Residual 1303');
    expect(sole).toContain("displayMode === 'all-day'");
    expect(sole).toContain('getProductTime');
    expect(sole).not.toContain('padStart');
    expect(sole).toContain('–');
    const body =
      sole.match(/export function formatCalendarEventTimeRange\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('all-day');
    expect(body).toContain('time.format.hm');
    expect(body).not.toContain('padStart');
    expect(body).toContain('–');
    expect(body).not.toContain('Intl.DateTimeFormat');
    expect(body).not.toContain('zh-CN');
    expect(body).not.toContain('startTime: number, endTime: number');
  });

  it('Residual 1273 vue DayDetail/Panel dual retired onto formatCalendarEventTimeRange sole', () => {
    expect(vue).toContain('Residual 1273');
    expect(vue).toContain('format-calendar-event-time-range');
    expect(vue).toContain('formatCalendarEventTimeRange');
    expect(vue).toMatch(/function formatTimeRange\b/);
    const vueBody = vue.match(/function formatTimeRange\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(vueBody).toContain('formatCalendarEventTimeRange');
    expect(vueBody).not.toContain('padStart');

    expect(panel).toContain('Residual 1273');
    expect(panel).toContain('format-calendar-event-time-range');
    expect(panel).toContain('formatCalendarEventTimeRange');
    const panelBody = panel.match(/function formatTimeRange\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(panelBody).toContain('formatCalendarEventTimeRange');
    expect(panelBody).not.toContain('padStart');
    expect(panel).not.toContain('Intl.DateTimeFormat');
  });

  it('formats the vue event range in the session timezone across DST', () => {
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

  it('documents Product Time pair vs event/all-day contracts via body shape', () => {
    const body = react.match(/function formatTimeRange\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('getProductTime');
    expect(body).toContain('time.format.hm');
    expect(body).toContain(' - ');
    expect(body).not.toContain('Intl.DateTimeFormat');

    const start = Date.UTC(2024, 0, 2, 9, 0, 0);
    const end = Date.UTC(2024, 0, 2, 10, 30, 0);
    expect(
      formatCalendarEventTimeRange(
        { displayMode: 'all-day', startTime: start, endTime: end },
        'All day',
      ),
    ).toBe('All day');
  });

  it('documents residual 1213 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(
      resolve(dir, 'format-time-range-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1213');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
