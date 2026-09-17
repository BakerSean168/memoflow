import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-080 closes the old Residual 1231 host/UTC formatter split.
 * - TaskEditor owns TaskPlanSchedule input semantics.
 * - ScheduleEventEditor delegates HH:mm rendering to the canonical Product Time facade.
 * Soft residual 1231: utils formatTimeToInput dual-retired onto @memoflow/time (ADR-037 T9).
 * Soft residual 1228: toDateInput keep-boundary remains separate.
 * Does not flip §13.2 checkboxes.
 */
describe('toTimeInput keep-boundary (residual 1231)', () => {
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

  it('retires the task-local host-time toTimeInput helper in favor of TaskPlanSchedule', () => {
    expect(task).toContain('TaskPlanScheduleSchema');
    expect(task).not.toMatch(/function toTimeInput\b/);
    expect(task).not.toContain('Residual 1231 keep-boundary');
    expect(task).not.toContain('getHours()');
    expect(task).not.toContain('getMinutes()');
  });

  it('keeps schedule toTimeInput on Product Time rather than UTC ISO slicing', () => {
    expect(schedule).toMatch(/function toTimeInput\b/);
    const body = schedule.match(/function toTimeInput\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain("return timestamp == null ? ''");
    expect(body).toContain('getProductTime().input.timeValue(timestamp)');
    expect(body).not.toContain('toISOString()');
    expect(body).not.toContain('new Date(');
    expect(body).not.toContain('getHours()');
    expect(body).not.toContain('padStart');
  });

  it('soft residual 1231 utils formatTimeToInput dual-retired (no utils date module)', () => {
    expect(utilsIndex).not.toContain("from './shared/date'");
    expect(utilsIndex).not.toMatch(/formatTimeToInput/);
    expect(utilsIndex).toContain('utils product date bridges retired');
  });

  it('documents that ScheduleEventEditor cannot reintroduce host/UTC Date formatting', () => {
    const body = schedule.match(/function toTimeInput\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('getProductTime().input.timeValue');
    expect(body).not.toContain('toISOString');
    expect(body).not.toContain('toTimeString');
    expect(body).not.toContain('new Date(');
  });

  it('documents ADR-080 Product Time lock intent without claiming unrelated §13.2 work complete', () => {
    const self = readFileSync(resolve(dir, 'to-time-input-keep-boundary.surface.spec.ts'), 'utf8');
    expect(self).toContain('ADR-080');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
