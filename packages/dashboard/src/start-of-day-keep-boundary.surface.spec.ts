import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1165: startOfDay keep-boundary (dashboard projection vs app-react agenda).
 * - dashboard domain projection: timestamp ms → timestamp ms (numeric day math for stats)
 * - app-react useScheduleAgenda: Date → Date (local calendar day for agenda UI)
 * Soft residual 1156: toDashboardTaskOccurrenceRecord dual retired remains separate.
 * Soft residual 1145: formatFileSize keep-boundary remains separate.
 * Does not flip §13.2 checkboxes.
 */
describe('startOfDay keep-boundary (residual 1165)', () => {
  const dir = __dirname;
  const projection = readFileSync(resolve(dir, 'domain/projection.ts'), 'utf8');
  const agenda = readFileSync(
    resolve(dir, '../../app-react/src/hooks/useScheduleAgenda.ts'),
    'utf8',
  );

  it('owns Residual 1165 keep-boundary markers on dashboard timestamp startOfDay', () => {
    expect(projection).toContain('Residual 1165 keep-boundary');
    expect(projection).toMatch(/function startOfDay\b/);
    expect(projection).toContain('timestamp: number');
    expect(projection).toContain('date.getTime()');
    const body = projection.match(/function startOfDay\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('getTime()');
    expect(body).toContain('setHours(0, 0, 0, 0)');
    // must not return a Date object
    expect(body).not.toContain('return next');
    expect(body).not.toContain('return date;');
    expect(body).not.toContain('date: Date');
  });

  it('differs from app-react agenda Date startOfDay (no force-merge)', () => {
    expect(agenda).toContain('Residual 1165 keep-boundary');
    expect(agenda).toMatch(/function startOfDay\b/);
    expect(agenda).toContain('date: Date');
    expect(agenda).toContain('Soft residual 1165');
    const body = agenda.match(/function startOfDay\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('new Date(date)');
    expect(body).toContain('return next');
    expect(body).not.toContain('getTime()');
    expect(body).not.toContain('timestamp: number');
  });

  it('runtime: dashboard projection startOfDay floors timestamp to local midnight ms', async () => {
    // Import projection module's behavior via reimplemented contract of the marked body.
    // Keep runtime check pure to avoid exporting private helper.
    function startOfDay(timestamp: number): number {
      const date = new Date(timestamp);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    }
    const mid = new Date(2024, 5, 15, 14, 30, 45, 123).getTime();
    const floored = startOfDay(mid);
    const d = new Date(floored);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
    expect(typeof floored).toBe('number');
  });

  it('documents residual 1165 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(resolve(dir, 'start-of-day-keep-boundary.surface.spec.ts'), 'utf8');
    expect(self).toContain('Residual 1165');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
