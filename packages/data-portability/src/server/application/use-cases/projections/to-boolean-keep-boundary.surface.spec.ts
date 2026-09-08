import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toBoolean } from './projection-helpers';

/**
 * Residual 1113: data-portability toBoolean keep-boundary.
 * Portable projection mapping always returns boolean (default fallback false),
 * accepting numbers and case-insensitive "true"/"false"/"1"/"0".
 * Intentionally not force-merged into query parseBoolean family:
 * - utils parseBoolean: string via parseString → boolean|undefined (no fallback/numbers)
 * - scheduler parseBoolean: empty short-circuit + boolean literals → boolean|undefined
 * - goal parseBoolean (985): "true"/"false" only → boolean|undefined
 * Soft residual 1021/1073/985: query parser duals/keep-boundaries remain.
 * Soft residual 1117: optionalString/toNonEmptyString keep-boundary remains.
 * Does not flip §13.2 checkboxes.
 */
describe('data-portability toBoolean keep-boundary (residual 1113)', () => {
  const dir = __dirname;
  const helpers = readFileSync(resolve(dir, 'projection-helpers.ts'), 'utf8');
  const utilsParse = readFileSync(
    resolve(dir, '../../../../../../utils/src/shared/parse-query-value.ts'),
    'utf8',
  );
  const schedulerRoutes = readFileSync(
    resolve(dir, '../../../../../../scheduler/src/api/routes.ts'),
    'utf8',
  );
  const goalParseBoolean = readFileSync(
    resolve(dir, '../../../../../../goal/src/api/routes/parse-boolean.ts'),
    'utf8',
  );

  it('owns Residual 1113 keep-boundary markers on projection toBoolean', () => {
    expect(helpers).toContain('Residual 1113 keep-boundary');
    expect(helpers).toMatch(/export function toBoolean\b/);
    expect(helpers).toContain('fallback = false');
    expect(helpers).toContain('return fallback');
    expect(helpers).toContain('value !== 0');
    expect(helpers).toContain("value.toLowerCase() === 'true'");
    // must not return undefined
    expect(helpers).not.toMatch(/export function toBoolean[\s\S]{0,350}return undefined/);
  });

  it('differs from utils/scheduler/goal parseBoolean query shapes (no force-merge)', () => {
    expect(utilsParse).toMatch(/export function parseBoolean\b/);
    expect(utilsParse).toContain('boolean | undefined');
    expect(utilsParse).toContain('return undefined');
    // soft residual may name toBoolean; utils must not implement fallback toBoolean
    expect(utilsParse).not.toMatch(/export function toBoolean\b/);
    expect(utilsParse).not.toContain('fallback = false');

    expect(schedulerRoutes).toMatch(/function parseBoolean\b/);
    expect(schedulerRoutes).toContain('boolean | undefined');
    expect(schedulerRoutes).toContain("value === ''");
    expect(schedulerRoutes).not.toMatch(/function toBoolean\b/);

    expect(goalParseBoolean).toContain('Residual 985');
    expect(goalParseBoolean).toContain('Soft residual 1113');
    expect(goalParseBoolean).toMatch(/export function parseBoolean\b/);
    expect(goalParseBoolean).toContain("value === 'true'");
    expect(goalParseBoolean).toContain("value === 'false'");
    expect(goalParseBoolean).not.toMatch(/function toBoolean\b/);
    expect(goalParseBoolean).not.toContain('toLowerCase');
  });

  it('runtime: always boolean with number/string coercion and fallback', () => {
    expect(toBoolean(true)).toBe(true);
    expect(toBoolean(false)).toBe(false);
    expect(toBoolean(1)).toBe(true);
    expect(toBoolean(0)).toBe(false);
    expect(toBoolean(-3)).toBe(true);
    expect(toBoolean('TRUE')).toBe(true);
    expect(toBoolean('False')).toBe(false);
    expect(toBoolean('1')).toBe(true);
    expect(toBoolean('0')).toBe(false);
    expect(toBoolean('yes')).toBe(false);
    expect(toBoolean(null)).toBe(false);
    expect(toBoolean(undefined, true)).toBe(true);
  });

  it('documents residual 1113 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(resolve(dir, 'to-boolean-keep-boundary.surface.spec.ts'), 'utf8');
    expect(self).toContain('Residual 1113');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
