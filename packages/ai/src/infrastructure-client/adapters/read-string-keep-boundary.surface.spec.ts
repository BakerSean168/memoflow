import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1171: readString keep-boundary (AI Result client vs API response builder).
 * - AI result-client-error: dotted path via readPath + non-empty string only
 * - API response-builder: single record key + empty string allowed
 * Soft residual 1162: contracts private isRecord keep-boundary remains separate.
 * Soft residual 1089: AI/desktop isRecord keep-boundary remains separate.
 * Does not flip §13.2 checkboxes.
 */
describe('readString keep-boundary (residual 1171)', () => {
  const dir = __dirname;
  const ai = readFileSync(resolve(dir, 'result-client-error.ts'), 'utf8');
  const api = readFileSync(
    resolve(dir, '../../../../../apps/api/src/shared/infrastructure/http/response-builder.ts'),
    'utf8',
  );

  it('owns Residual 1171 keep-boundary markers on AI path+non-empty readString', () => {
    expect(ai).toContain('Residual 1171 keep-boundary');
    expect(ai).toMatch(/function readString\b/);
    expect(ai).toContain('readPath(value, path)');
    expect(ai).toContain('result.length > 0');
    const body = ai.match(/function readString\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('path: string');
    expect(body).toContain('readPath');
    expect(body).toContain('length > 0');
    expect(body).not.toContain('record[key]');
    expect(body).not.toContain('Record<string, unknown>');
  });

  it('differs from API response-builder (no force-merge): API dropped the temp readString fallback', () => {
    // RefArch review R2 (P2-3): the API response-builder removed the temporary
    // `readString`/`readNumber` fallback for `req.traceId`/`req.id`/`req.startTime`
    // (AGENT.md: no temp dual-track). The residual 1171 boundary is now "AI keeps
    // the dotted non-empty readString; the API keeps none".
    expect(api).not.toMatch(/function readString\b/);
    expect(api).not.toMatch(/function readNumber\b/);
    expect(api).not.toContain('Soft residual 1171');
    expect(api).toContain('requestContext');
  });

  it('runtime: documents AI non-empty readString vs API correlation via requestContext only', () => {
    // AI rejects empty dotted values; the API envelope reads the producer-owned
    // `req.requestContext` carrier instead of a string/number fallback pair.
    function aiReadString(value: unknown, path: string): string | undefined {
      const result = path.split('.').reduce<unknown>((current, segment) => {
        if (!current || typeof current !== 'object') return undefined;
        return (current as Record<string, unknown>)[segment];
      }, value);
      return typeof result === 'string' && result.length > 0 ? result : undefined;
    }
    expect(aiReadString({ error: { message: 'x' } }, 'error.message')).toBe('x');
    expect(aiReadString({ error: { message: '' } }, 'error.message')).toBeUndefined();
    expect(api).toContain('requestContext?.traceId');
    expect(api).toContain('requestContext?.startedAt');
  });

  it('documents residual 1171 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(resolve(dir, 'read-string-keep-boundary.surface.spec.ts'), 'utf8');
    expect(self).toContain('Residual 1171');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
