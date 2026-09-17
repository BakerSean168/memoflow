import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-080 closes the old Residual 1234 host-Date split.
 * - TaskEditor keeps canonical TaskPlanSchedule ownership.
 * - ScheduleEventEditor parses Ymd/Hm through Product Time and combines them in the user timezone.
 * Soft residual 1234: utils Date-mutate helpers dual-retired onto @memoflow/time (ADR-037 T9).
 * Soft residual 1231: toTimeInput keep-boundary remains separate.
 * Soft residual 1228: toDateInput keep-boundary remains separate.
 * Does not flip §13.2 checkboxes.
 */
describe('combineDateAndTime / parseTimestamp keep-boundary (residual 1234)', () => {
  const dir = __dirname;
  const task = readFileSync(
    resolve(dir, '../../../../app-react/src/screens/TaskEditorScreen.tsx'),
    'utf8',
  );
  const schedule = readFileSync(
    resolve(dir, '../../../../app-react/src/screens/ScheduleEventEditorScreen.tsx'),
    'utf8',
  );
  const utilsIndex = readFileSync(resolve(dir, '../../../../utils/src/index.ts'), 'utf8');

  it('keeps the retired local Date combiner out of TaskEditor and uses TaskPlanSchedule', () => {
    expect(task).toContain('TaskPlanScheduleSchema');
    expect(task).not.toMatch(/function combineDateAndTime\b/);
    expect(task).not.toContain('new Date(year, (month || 1) - 1, day || 1');
    expect(task).not.toContain('Residual 1234 keep-boundary');
  });

  it('keeps ScheduleEventEditor on Product Time instead of host Date parsing', () => {
    expect(schedule).toContain("import { getProductTime } from '../utils/product-time'");
    expect(schedule).toMatch(/function parseTimestamp\b/);
    const body = schedule.match(/function parseTimestamp\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('.trim()');
    expect(body).toContain('getProductTime()');
    expect(body).toContain('input.parseDateValue');
    expect(body).toContain('input.parseTimeValue');
    expect(body).toContain('input.combine');
    expect(body).toContain('return date == null || hm == null ? null');
    expect(body).not.toContain('Date.parse');
    expect(body).not.toContain('new Date(');
    expect(body).not.toContain('getTime()');
  });

  it('soft residual 1234 utils Date-mutate helpers dual-retired (no utils date module)', () => {
    expect(utilsIndex).not.toContain("from './shared/date'");
    expect(utilsIndex).not.toMatch(/updateDateKeepTime/);
    expect(utilsIndex).not.toMatch(/updateTimeKeepDate/);
  });

  it('documents the ADR-080 Product Time lock instead of host Date overflow semantics', () => {
    const body = schedule.match(/function parseTimestamp\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('input.parseDateValue');
    expect(body).toContain('input.parseTimeValue');
    expect(body).toContain('input.combine');
    expect(schedule).not.toContain('new Date(year');
    expect(schedule).not.toContain('Date.parse(`${date}T${time}:00`)');
  });

  it('documents ADR-080 Product Time lock intent without claiming unrelated §13.2 work complete', () => {
    const self = readFileSync(
      resolve(dir, 'combine-date-and-time-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('ADR-080');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
