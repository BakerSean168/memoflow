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

  it('keeps app-vue Task date parsing on Product Time', () => {
    expect(vue).toMatch(/const parseDateInput\b/);
    expect(vue).toContain('getProductTime');
    expect(vue).toContain('parseDateValue');
    expect(vue).toContain('startOfYmd');
    const body = vue.match(/const parseDateInput = \([\s\S]*?\n\};/)?.[0] ?? '';
    expect(body).not.toContain('Date.parse');
    expect(body).not.toContain('new Date(');
    expect(body).not.toContain('.getTime()');
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

  it('keeps date formatting on Product Time too', () => {
    expect(vue).toMatch(/const formatDateToInput\b/);
    expect(vue).toContain('dateValue');
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
