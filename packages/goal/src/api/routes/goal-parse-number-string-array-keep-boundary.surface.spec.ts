import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1067: goal local parseNumber + parseStringArray keep-boundary.
 * Intentionally not merged into utils parse-query-value sole (residual 989):
 * - goal parseNumber applies Number(value) directly (empty string → 0);
 *   utils parseNumber goes through parseString and treats empty as undefined.
 * - goal parseStringArray accepts Express query arrays + comma-separated strings;
 *   utils persistence parseStringArray is JSON-string only (different domain).
 * Soft residual 985: goal parseBoolean true/false-only sole remains separate.
 * Soft residual: schedule route parsers keep-boundary remains in utils surface.
 * Does not flip §13.2 checkboxes.
 */
describe('goal parseNumber/parseStringArray keep-boundary (residual 1067)', () => {
  const dir = __dirname;
  const goalRoutes = readFileSync(resolve(dir, 'goal.routes.ts'), 'utf8');
  const utilsSole = readFileSync(
    resolve(dir, '../../../../utils/src/shared/parse-query-value.ts'),
    'utf8',
  );
  const utilsPersistence = readFileSync(
    resolve(dir, '../../../../utils/src/shared/persistence.ts'),
    'utf8',
  );
  const parseBooleanSole = readFileSync(resolve(dir, 'parse-boolean.ts'), 'utf8');

  it('owns residual 1067 keep-boundary markers on local parseNumber/parseStringArray', () => {
    expect(goalRoutes).toContain('Residual 1067 keep-boundary');
    expect(goalRoutes).toMatch(/function parseNumber\b/);
    expect(goalRoutes).toMatch(/function parseStringArray\b/);
    expect(goalRoutes).toContain('Number.isFinite(parsed)');
    expect(goalRoutes).toContain('.split(\',\')');
    // Must not import utils query parsers for these helpers
    expect(goalRoutes).not.toContain("from '@memoflow/utils/shared'");
    expect(goalRoutes).not.toMatch(/import\s*\{[^}]*parseNumber[^}]*\}\s*from/);
    expect(goalRoutes).not.toMatch(/import\s*\{[^}]*parseStringArray[^}]*\}\s*from/);
  });

  it('differs from utils parse-query-value sole shape (no force-merge)', () => {
    expect(utilsSole).toMatch(/export function parseNumber\b/);
    expect(utilsSole).toContain('Soft residual 1067');
    expect(utilsSole).toContain('parseString(value)');
    // utils empty-string → undefined via parseString + !raw; goal applies Number directly
    expect(utilsSole).toContain('if (!raw) return undefined');
    expect(goalRoutes).not.toContain('if (!raw) return undefined');
    // Soft residual may name goal keep-boundary; sole must not own goal comma-split array helper
    expect(utilsSole).not.toMatch(/export function parseStringArray\b/);
    expect(utilsSole).not.toContain(".split(',')");
  });

  it('differs from utils persistence parseStringArray (JSON domain, not query)', () => {
    expect(utilsPersistence).toMatch(/export function parseStringArray\b/);
    expect(utilsPersistence).toContain('JSON.parse');
    expect(goalRoutes).not.toContain('JSON.parse');
  });

  it('keeps residual 985 parseBoolean sole separate from this keep-boundary', () => {
    expect(parseBooleanSole).toContain('Residual 985');
    expect(parseBooleanSole).toMatch(/export function parseBoolean\b/);
    expect(goalRoutes).toContain("import { parseBoolean } from './parse-boolean'");
    expect(goalRoutes).not.toMatch(/function parseBoolean\b/);
  });

  it('documents residual 1067 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(
      resolve(dir, 'goal-parse-number-string-array-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1067');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
