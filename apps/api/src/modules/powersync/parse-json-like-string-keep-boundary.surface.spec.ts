import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeCrudData } from './crud-normalization';

/**
 * Residual 1091: api PowerSync parseJsonLikeString keep-boundary.
 * Only brace/bracket-looking strings are JSON.parsed; other strings stay as-is.
 * Malformed JSON-looking text is kept unchanged by outer try/catch (upload batch safe).
 * Intentionally not:
 * - utils parseJson/parseJsonSafe (null/undefined + fallback, never leave raw string on catch)
 * - account PowerSync private parseJson (required string, throws on invalid)
 * Soft residual 1081: account PowerSync throw parseJson keep-boundary remains.
 * Soft residual 1095: data-portability parseJsonField keep-boundary surface (no force-merge).
 * Soft residual 1025: notification parseJsonSafe dual retired onto utils sole.
 * Does not flip §13.2 checkboxes.
 */
describe('api PowerSync parseJsonLikeString keep-boundary (residual 1091)', () => {
  const dir = __dirname;
  const crud = readFileSync(resolve(dir, 'crud-normalization.ts'), 'utf8');
  const utilsPersistence = readFileSync(
    resolve(dir, '../../../../../packages/utils/src/shared/persistence.ts'),
    'utf8',
  );
  const accountMapper = readFileSync(
    resolve(
      dir,
      '../../../../../packages/account/src/server/infrastructure/adapters/powersync/mappers/account-powersync.mapper.ts',
    ),
    'utf8',
  );

  it('owns Residual 1091 keep-boundary markers on parseJsonLikeString', () => {
    expect(crud).toContain('Residual 1091 keep-boundary');
    expect(crud).toMatch(/function parseJsonLikeString\b/);
    expect(crud).toContain("trimmed.startsWith('{')");
    expect(crud).toContain("trimmed.startsWith('[')");
    expect(crud).toContain('JSON.parse(trimmed)');
    expect(crud).toContain('return value');
    // outer try/catch keeps malformed JSON-looking strings
    expect(crud).toContain('catch');
    expect(crud).toContain('return value');
    // must not import utils parsers
    expect(crud).not.toContain('@memoflow/utils');
    expect(crud).not.toMatch(/import\s*\{[^}]*parseJsonSafe[^}]*\}/);
    expect(crud).not.toMatch(/import\s*\{[^}]*\bparseJson\b[^}]*\}/);
  });

  it('differs from utils parseJson/parseJsonSafe sole shape (no force-merge)', () => {
    expect(utilsPersistence).toMatch(/export function parseJson\b/);
    expect(utilsPersistence).toMatch(/export function parseJsonSafe\b/);
    expect(utilsPersistence).toContain('Soft residual 1091');
    expect(utilsPersistence).toContain('value: string | null | undefined');
    expect(utilsPersistence).toContain('if (!value) return fallback');
    // Soft residual may name keep-boundary; sole must not implement brace-only helper
    expect(utilsPersistence).not.toMatch(/function parseJsonLikeString\b/);
    expect(utilsPersistence).not.toContain("startsWith('{')");
    expect(utilsPersistence).not.toContain('PowerSync clients send CRUD');
  });

  it('differs from account PowerSync throw-on-invalid parseJson keep-boundary', () => {
    expect(accountMapper).toContain('Residual 1081 keep-boundary');
    expect(accountMapper).toContain('Soft residual 1091');
    expect(accountMapper).toMatch(/private static parseJson\b/);
    expect(accountMapper).toContain('JSON.parse(value)');
    // soft residual may name parseJsonLikeString; account must not implement it
    expect(accountMapper).not.toMatch(/function parseJsonLikeString\b/);
    expect(accountMapper).not.toContain("startsWith('{')");
  });

  it('runtime: JSON-looking fields parse; non-JSON and malformed stay safe', () => {
    expect(normalizeCrudData('goals', { tags: '["work","focus"]' })).toEqual({
      tags: ['work', 'focus'],
    });
    // non JSON-looking string for a JSON field stays string (not forced parse)
    expect(normalizeCrudData('goals', { tags: 'not-json' })).toEqual({ tags: 'not-json' });
    // malformed JSON-looking text kept unchanged
    expect(normalizeCrudData('goals', { tags: '[invalid]' })).toEqual({ tags: '[invalid]' });
  });

  it('documents residual 1091 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(
      resolve(dir, 'parse-json-like-string-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1091');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
