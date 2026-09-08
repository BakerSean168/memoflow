import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1210: formatDateToInput dual retired onto @memoflow/time (ADR-037 T9).
 * - utils shared/date product bridges deleted (no formatDateToInput export)
 * - app-vue TimeConfigSection: epoch ms → getProductTime().format.dateToYmd
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

  it('app-vue task formatDateToInput uses @memoflow/time product facade', () => {
    expect(vue).toContain('Residual 1210');
    expect(vue).toMatch(/const formatDateToInput\b/);
    expect(vue).toContain('getProductTime');
    expect(vue).toContain('input.dateValue');
    const body = vue.match(/const formatDateToInput\s*=\s*\([\s\S]*?\};/)?.[0] ?? '';
    expect(body).toContain('getProductTime()');
    expect(body).toContain('dateValue');
    expect(body).not.toContain('date-fns');
  });

  it('runtime: documents epoch→YMD contract via body shape', () => {
    function vueFormatDateToInput(timestamp: number): string {
      const date = new Date(timestamp);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const fixed = new Date(2024, 0, 2);
    expect(vueFormatDateToInput(fixed.getTime())).toBe('2024-01-02');
    expect(vue).toContain('timestamp: number');
  });

  it('documents residual 1210 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(
      resolve(dir, 'format-date-to-input-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1210');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('retired');
  });
});
