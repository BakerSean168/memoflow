import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1234: combineDateAndTime / parseTimestamp keep-boundary (local always-number vs ISO null).
 * - app-react TaskEditor combineDateAndTime: split YMD/HH:mm → local Date ctor → getTime() always number
 * - app-react ScheduleEventEditor parseTimestamp: trim; empty→null; Date.parse; isNaN→null
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
  const utilsIndex = readFileSync(
    resolve(dir, '../../../../utils/src/index.ts'),
    'utf8',
  );

  it('keeps the retired local Date combiner out of TaskEditor and uses TaskPlanSchedule', () => {
    expect(task).toContain('TaskPlanScheduleSchema');
    expect(task).not.toMatch(/function combineDateAndTime\b/);
    expect(task).not.toContain('new Date(year, (month || 1) - 1, day || 1');
    expect(task).not.toContain('Residual 1234 keep-boundary');
  });

  it('differs from schedule parseTimestamp trim+Date.parse+null (no force-merge)', () => {
    expect(schedule).toContain('Residual 1234 keep-boundary');
    expect(schedule).toMatch(/function parseTimestamp\b/);
    expect(schedule).toContain('Soft residual 1234');
    expect(schedule).toContain('Date.parse');
    expect(schedule).toContain('Number.isNaN');
    const body = schedule.match(/function parseTimestamp\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('.trim()');
    expect(body).toContain('return null');
    expect(body).toContain('Date.parse');
    expect(body).not.toContain('getTime()');
    expect(body).not.toContain('month || 1');
    expect(body).not.toContain('new Date(year');
  });

  it('soft residual 1234 utils Date-mutate helpers dual-retired (no utils date module)', () => {
    expect(utilsIndex).not.toContain("from './shared/date'");
    expect(utilsIndex).not.toMatch(/updateDateKeepTime/);
    expect(utilsIndex).not.toMatch(/updateTimeKeepDate/);
  });

  it('runtime: documents local always-number vs ISO null contracts via body shape', () => {
    function combineDateAndTime(dateValue: string, timeValue: string): number {
      const [year, month, day] = dateValue.split('-').map(Number);
      const [hours, minutes] = timeValue.split(':').map(Number);
      const date = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
      return date.getTime();
    }
    function parseTimestamp(dateValue: string, timeValue: string): number | null {
      const date = dateValue.trim();
      const time = timeValue.trim();
      if (date.length === 0 || time.length === 0) {
        return null;
      }
      const parsed = Date.parse(`${date}T${time}:00`);
      return Number.isNaN(parsed) ? null : parsed;
    }
    expect(parseTimestamp('', '09:00')).toBeNull();
    expect(parseTimestamp('2026-07-24', '')).toBeNull();
    expect(parseTimestamp('   ', '09:00')).toBeNull();
    expect(typeof combineDateAndTime('2026-07-24', '09:00')).toBe('number');
    expect(Number.isFinite(combineDateAndTime('2026-07-24', '09:00'))).toBe(true);
    expect(parseTimestamp('not-a-date', '09:00')).toBeNull();
    // invalid local parts still yield a number (Date overflow semantics), not null
    expect(typeof combineDateAndTime('bad', 'xx')).toBe('number');
  });

  it('documents residual 1234 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(
      resolve(dir, 'combine-date-and-time-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1234');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
