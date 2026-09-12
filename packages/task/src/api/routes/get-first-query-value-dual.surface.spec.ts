import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFirstQueryValue } from './get-first-query-value';

/**
 * Residual 983: getFirstQueryValue dual retired (task API routes).
 * Sole body in get-first-query-value.ts; instance + template routes import it.
 * Soft residual 1038: tip focused suite numbers track Residual 1038 evidence tip (309/1339).
 * Does not flip §13.2 checkboxes.
 */
describe('getFirstQueryValue dual retired (residual 983)', () => {
  const dir = __dirname;
  const sole = readFileSync(resolve(dir, 'get-first-query-value.ts'), 'utf8');
  const instance = readFileSync(resolve(dir, 'task-occurrence.routes.ts'), 'utf8');
  const template = readFileSync(resolve(dir, 'task-plan.routes.ts'), 'utf8');

  it('owns sole getFirstQueryValue helper body', () => {
    expect(sole).toContain('Residual 983');
    expect(sole).toMatch(/export function getFirstQueryValue\b/);
    expect(sole).toContain('Array.isArray(value)');
    expect(sole).toContain("typeof value[0] === 'string'");
  });

  it('instance + template routes import sole without local dual bodies', () => {
    for (const [label, source] of [
      ['instance', instance],
      ['template', template],
    ] as const) {
      expect(source, label).toContain('Residual 983');
      expect(source, label).toContain("import { getFirstQueryValue } from './get-first-query-value'");
      expect(source, label).not.toMatch(/function getFirstQueryValue\b/);
      expect(source, label).toContain('getFirstQueryValue(');
    }
  });

  it('prefers first string query entry and rejects non-strings', () => {
    expect(getFirstQueryValue(undefined)).toBeUndefined();
    expect(getFirstQueryValue(null)).toBeUndefined();
    expect(getFirstQueryValue(42)).toBeUndefined();
    expect(getFirstQueryValue('status')).toBe('status');
    expect(getFirstQueryValue(['a', 'b'])).toBe('a');
    expect(getFirstQueryValue([1, 'b'])).toBeUndefined();
    expect(getFirstQueryValue([])).toBeUndefined();
  });
});
