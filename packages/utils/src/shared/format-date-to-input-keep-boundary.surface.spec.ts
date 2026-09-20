import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1210: formatDateToInput dual retired onto @memoflow/time (ADR-037 T9).
 * - utils shared/date product bridges deleted (no formatDateToInput export)
 * - app-vue TimeConfigSection owns canonical Ymd schedule dates through the
 *   TaskPlanScheduleSchema and calendar/display helpers; it performs no epoch conversion.
 * Soft residual 1207: formatMessageTime keep-boundary remains separate.
 * Soft residual 1204: formatDateTime keep-boundary remains separate.
 * Does not flip §13.2 checkboxes.
 */
describe('formatDateToInput dual retired (residual 1210)', () => {
  const dir = __dirname;
  const utilsDatePath = resolve(dir, 'date.ts');
  let utilsDate: string | null = null;
  try {
    utilsDate = readFileSync(utilsDatePath, 'utf8');
  } catch {
    utilsDate = null;
  }
  const utilsIndex = readFileSync(resolve(dir, '../index.ts'), 'utf8');
  const sharedIndex = readFileSync(resolve(dir, 'index.ts'), 'utf8');
  const vue = readFileSync(
    resolve(
      dir,
      '../../../app-vue/src/modules/task/components/TaskPlanForm/sections/TimeConfigSection.vue',
    ),
    'utf8',
  );
  const productDatePicker = readFileSync(
    resolve(dir, '../../../app-vue/src/shared/components/ProductDatePicker.vue'),
    'utf8',
  );

  it('owns Residual 1210 retirement: utils no longer exports formatDateToInput', () => {
    expect(utilsIndex).not.toMatch(/export \{[^}]*formatDateToInput/);
    expect(utilsIndex).not.toContain("from './shared/date'");
    // date module deleted or emptied of product format bridges
    if (utilsDate != null) {
      expect(utilsDate).not.toMatch(/export function formatDateToInput\b/);
      expect(utilsDate).not.toMatch(/export function ensureDate\b/);
    } else {
      expect(sharedIndex).not.toContain("from './date'");
    }
  });

  it('app-vue task form keeps canonical Ymd dates at the schedule boundary', () => {
    expect(vue).toContain('TaskPlanScheduleSchema');
    expect(vue).toContain('ProductDatePicker');
    expect(productDatePicker).toContain('formatProductYmd');
    expect(productDatePicker).toContain('parseToCalendarDate');
    expect(productDatePicker).toContain('handleCalendarSelect');
    for (const source of [vue, productDatePicker]) {
      expect(source).not.toContain('formatDateToInput');
      expect(source).not.toContain('getProductTime');
      expect(source).not.toContain('new Date(');
      expect(source).not.toContain('toISOString');
    }
  });

  it('runtime: documents that schedule dates remain canonical Ymd values', () => {
    const schedule = { kind: 'OneTime', date: '2024-01-02', timing: { kind: 'AllDay' } };
    expect(schedule.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(vue).toContain('startDate.value = currentDate(schedule)');
  });

  it('documents residual 1210 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(
      resolve(dir, 'format-date-to-input-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1210');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('retired');
    expect(self).toContain('epoch conversion');
  });
});
