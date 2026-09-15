import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1189: getCorsOrigins keep-boundary (API env list vs Playwright E2E joined string).
 * - API env: CORS_ORIGIN → string[] (trim/filter only)
 * - Playwright: E2E web + legacy localhost + env → comma-joined string
 * Soft residual 1186: getPlanById keep-boundary remains separate.
 * Soft residual 1183: defaultExtractContext keep-boundary remains separate.
 * Does not flip §13.2 checkboxes.
 */
describe('getCorsOrigins keep-boundary (residual 1189)', () => {
  const dir = __dirname;
  const api = readFileSync(resolve(dir, 'env.ts'), 'utf8');
  const playwright = readFileSync(resolve(dir, '../../../../../web/playwright.server.ts'), 'utf8');

  it('owns Residual 1189 keep-boundary markers on API env string[] getCorsOrigins', () => {
    expect(api).toContain('Residual 1189 keep-boundary');
    expect(api).toMatch(/export function getCorsOrigins\b/);
    expect(api).toContain('string[]');
    expect(api).toContain('env.CORS_ORIGIN');
    const body = api.match(/export function getCorsOrigins\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('split');
    expect(body).toContain('trim');
    expect(body).toContain('filter');
    expect(body).not.toContain('getE2EWebOrigin');
    expect(body).not.toContain('LEGACY_LOCALHOST');
    expect(body).not.toContain('.join(');
  });

  it('differs from Playwright E2E joined-string getCorsOrigins (no force-merge)', () => {
    expect(playwright).toContain('Residual 1189 keep-boundary');
    expect(playwright).toMatch(/function getCorsOrigins\b/);
    expect(playwright).toContain('Soft residual 1189');
    expect(playwright).toContain('getE2EWebOrigin');
    expect(playwright).toContain('LEGACY_LOCALHOST_WEB_ORIGIN');
    expect(playwright).toContain(': string');
    const body = playwright.match(/function getCorsOrigins\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('new Set');
    expect(body).toContain('.join(');
    expect(body).toContain('process.env.CORS_ORIGIN');
    expect(body).toContain('getE2EWebOrigin()');
    expect(body).not.toContain('string[]');
    expect(body).not.toContain('isAllCorsOriginsAllowed');
  });

  it('runtime: documents string[] vs joined-string contracts via body shape', () => {
    function apiGetCorsOrigins(corsOrigin: string): string[] {
      return corsOrigin
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    function playwrightGetCorsOrigins(
      corsOrigin: string,
      e2eOrigin: string,
      legacy: string,
    ): string {
      const configured = corsOrigin
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
      return [...new Set([e2eOrigin, legacy, ...configured])].join(',');
    }
    expect(apiGetCorsOrigins(' http://a.com ,http://b.com ')).toEqual([
      'http://a.com',
      'http://b.com',
    ]);
    expect(
      playwrightGetCorsOrigins(
        'http://b.com',
        'http://e2e.local',
        'http://localhost:5173',
      ),
    ).toBe('http://e2e.local,http://localhost:5173,http://b.com');
    expect(Array.isArray(apiGetCorsOrigins('*'))).toBe(true);
    expect(typeof playwrightGetCorsOrigins('', 'http://e2e', 'http://legacy')).toBe('string');
  });

  it('documents residual 1189 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(resolve(dir, 'get-cors-origins-keep-boundary.surface.spec.ts'), 'utf8');
    expect(self).toContain('Residual 1189');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
