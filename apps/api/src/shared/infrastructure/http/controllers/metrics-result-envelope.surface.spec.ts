import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Residual 623: GET /metrics/json uses Result/HttpResponse envelope only.
 * Prometheus /metrics stays text/plain (scraper contract).
 */
const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(here, name), 'utf8');
}

describe('API metrics JSON Result envelope (residual 623)', () => {
  it('getJson builds HttpResponse via createApiResponseBuilder', () => {
    const source = read('metrics.controller.ts');
    expect(source).toContain('Residual 623');
    expect(source).toContain("from '../response-builder.js'");
    expect(source).toContain('createApiResponseBuilder');
    expect(source).toContain('responseBuilder.success');
    // Prometheus path remains text/plain, not Result envelope.
    expect(source).toContain("text/plain; version=0.0.4");
    // getJson body is success(payload), not raw dual-track object keys at top level.
    const getJsonIdx = source.indexOf('getJson:');
    expect(getJsonIdx).toBeGreaterThan(-1);
    const getJsonSlice = source.slice(getJsonIdx, getJsonIdx + 2000);
    expect(getJsonSlice).toContain('responseBuilder.success(payload)');
    expect(getJsonSlice).not.toMatch(/res\.status\(200\)\.json\(\s*\{/);
  });

  it('infrastructure routes mount /metrics and /metrics/json', () => {
    const routes = readFileSync(join(here, '../routes/infrastructure-routes.ts'), 'utf8');
    expect(routes).toContain("router.get('/metrics', metricsController.getPrometheus)");
    expect(routes).toContain("router.get('/metrics/json', metricsController.getJson)");
  });
});
