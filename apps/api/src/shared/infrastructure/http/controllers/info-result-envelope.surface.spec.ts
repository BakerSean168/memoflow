import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Residual 625: GET /info uses Result/HttpResponse envelope only.
 * K8s probes (/healthz, /readyz) intentionally stay non-Result.
 */
const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(here, name), 'utf8');
}

describe('API /info Result envelope (residual 625)', () => {
  it('info controller builds HttpResponse via createApiResponseBuilder', () => {
    const source = read('info.controller.ts');
    expect(source).toContain('Residual 625');
    expect(source).toContain("from '../response-builder.js'");
    expect(source).toContain('createApiResponseBuilder');
    expect(source).toContain('responseBuilder.success');
    expect(source).not.toMatch(/res\.status\(200\)\.json\(\s*response\s*\)/);
    expect(source).not.toMatch(/res\.status\(200\)\.json\(\s*payload\s*\)/);
  });

  it('infrastructure routes mount GET /info', () => {
    const routes = readFileSync(join(here, '../routes/infrastructure-routes.ts'), 'utf8');
    expect(routes).toContain("router.get('/info', infoController.getInfo)");
  });

  it('health probes remain dedicated non-Result ops shapes', () => {
    const health = read('health.controller.ts');
    expect(health).toContain('liveness');
    expect(health).toContain('readiness');
    expect(health).not.toContain('createApiResponseBuilder');
  });
});
