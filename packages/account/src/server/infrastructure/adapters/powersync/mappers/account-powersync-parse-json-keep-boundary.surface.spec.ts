import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1081: account PowerSync private parseJson keep-boundary.
 * Throws on invalid JSON for the required string profile column.
 * Account.settings was retired by SETTING-9203 and stays outside this mapper.
 * Intentionally not merged into utils persistence parseJson / parseJsonSafe
 * (null/undefined input + fallback, never throw).
 * Soft residual 1025: notification parseJsonSafe dual retired onto utils sole.
 * Soft residual 1091: api PowerSync parseJsonLikeString keep-boundary surface (no force-merge).
 * Soft residual 1095: data-portability parseJsonField keep-boundary surface (no force-merge).
 * Does not flip §13.2 checkboxes.
 */
describe('account PowerSync parseJson keep-boundary (residual 1081)', () => {
  const dir = __dirname;
  const mapper = readFileSync(resolve(dir, 'account-powersync.mapper.ts'), 'utf8');
  const utilsPersistence = readFileSync(
    resolve(dir, '../../../../../../../utils/src/shared/persistence.ts'),
    'utf8',
  );
  const parseJsonSafeSurface = readFileSync(
    resolve(dir, '../../../../../../../utils/src/shared/dual-registry.surface.spec.ts'),
    'utf8',
  );

  it('owns Residual 1081 keep-boundary markers on private parseJson', () => {
    expect(mapper).toContain('Residual 1081 keep-boundary');
    expect(mapper).toMatch(/private static parseJson\b/);
    expect(mapper).toContain('JSON.parse(value)');
    expect(mapper).toContain('row.profile');
    expect(mapper).not.toContain('row.settings');
    // required string signature (not null/undefined + fallback)
    expect(mapper).toMatch(/private static parseJson<T>\(value: string\): T/);
    // Soft keep-boundary docs may name utils symbols; assert no import/call
    expect(mapper).not.toContain("@memoflow/utils/shared");
    expect(mapper).not.toMatch(/import\s*\{[^}]*parseJsonSafe[^}]*\}/);
    expect(mapper).not.toMatch(/import\s*\{[^}]*\bparseJson\b[^}]*\}/);
    expect(mapper).not.toMatch(/parseJsonSafe\s*\(/);
  });

  it('differs from utils parseJson/parseJsonSafe sole shape (no force-merge)', () => {
    expect(utilsPersistence).toMatch(/export function parseJson\b/);
    expect(utilsPersistence).toMatch(/export function parseJsonSafe\b/);
    expect(utilsPersistence).toContain('Soft residual 1081');
    // utils accepts null/undefined and uses fallback / try-catch
    expect(utilsPersistence).toContain('value: string | null | undefined');
    expect(utilsPersistence).toContain('if (!value) return fallback');
    expect(utilsPersistence).toContain('catch');
    // Soft residual may name keep-boundary; sole must not implement account mapper private helper
    expect(utilsPersistence).not.toMatch(/private static parseJson\b/);
    expect(utilsPersistence).not.toContain('AccountPowerSyncMapper');
    expect(utilsPersistence).not.toContain('PowerSyncAccountRow');
    // keep-boundary function body has no fallback param
    const start = mapper.indexOf('private static parseJson<T>');
    expect(start).toBeGreaterThanOrEqual(0);
    const body = mapper.slice(start, start + 200);
    expect(body).toContain('JSON.parse(value)');
    expect(body).not.toContain('fallback');
    expect(body).not.toContain('try');
  });

  it('utils parseJsonSafe dual surface documents soft residual 1081 keep-boundary', () => {
    expect(parseJsonSafeSurface).toContain('Soft residual 1081');
    expect(parseJsonSafeSurface).toContain('account');
    expect(parseJsonSafeSurface).toContain('powersync');
  });

  it('documents residual 1081 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(
      resolve(dir, 'account-powersync-parse-json-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1081');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
