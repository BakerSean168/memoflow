import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1225 closed: Goal/Task date inputs converge on Product Time.
 * Goal targets retain GoalTimeframe precision; UI calendar strings stay Ymd.
 * Direct Date.parse/new Date calendar conversion must not return.
 */
describe('date input Product Time boundary (residual 1225)', () => {
  const dir = __dirname;
  const vue = readFileSync(
    resolve(dir, '../../modules/task/components/TaskPlanForm/sections/TimeConfigSection.vue'),
    'utf8',
  );
  const react = readFileSync(
    resolve(dir, '../../../../app-react/src/screens/GoalEditorScreen.tsx'),
    'utf8',
  );
  const calendarSelect = readFileSync(resolve(dir, 'handle-calendar-select.ts'), 'utf8');
  const parseCalendar = readFileSync(resolve(dir, 'parse-to-date.ts'), 'utf8');
  const formatDisplay = readFileSync(resolve(dir, 'format-display-date.ts'), 'utf8');

  it('keeps app-vue Task date parsing on canonical Ymd calendar adapters', () => {
    expect(vue).toContain('parseToCalendarDate');
    expect(vue).toContain('handleCalendarSelect');
    expect(parseCalendar).toContain('ymdToCalendarDateValue');
    expect(parseCalendar).toContain('requireYmd');
    expect(calendarSelect).toContain('calendarDateValueToYmd');
    for (const source of [vue, parseCalendar, calendarSelect]) {
      expect(source).not.toContain('Date.parse');
      expect(source).not.toContain('getTimezoneOffset');
      expect(source).not.toContain('toISOString().slice');
    }
  });

  it('keeps app-react Goal target parsing on canonical Product Time helpers', () => {
    expect(react).toContain('goalTimeframeInputValue');
    expect(react).toContain('parseGoalTimeframeInput');
    expect(react).toContain('parseProductYmdInput');
    expect(react).toContain("from '../utils/product-time'");
    expect(react).not.toMatch(/function parseDateInput\b/);
    expect(react).not.toContain('Date.parse');
    expect(react).not.toContain('new Date(');
  });

  it('keeps date formatting on the shared Product Time formatter', () => {
    expect(vue).toContain('formatDisplayDate');
    expect(formatDisplay).toContain("from '@memoflow/time'");
    expect(react).toContain('goalTimeframeInputValue');
    expect(react).not.toMatch(/function toDateInput\b/);
  });

  it('documents the anti-resurrection boundary', () => {
    const self = readFileSync(
      resolve(dir, 'parse-date-input-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1225 closed');
    expect(self).toContain('Product Time');
    expect(self).toContain('Direct Date.parse/new Date calendar conversion must not return');
  });
});
