import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Residual 627: global error middleware uses Result/HttpResponse envelope only.
 * Flat dual-track `{ ok, code: string, message }` is retired.
 */
const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(here, name), 'utf8');
}

describe('API error middleware Result envelope (residual 627)', () => {
  it('error handlers build HttpResponse via createApiResponseBuilder', () => {
    const source = read('error.ts');
    expect(source).toContain('Residual 627');
    expect(source).toContain("from '../http/response-builder.js'");
    expect(source).toContain('createApiResponseBuilder');
    expect(source).toContain('responseBuilder.notFound');
    expect(source).toContain('responseBuilder.forbidden');
    expect(source).toContain('responseBuilder.error');
    expect(source).toContain('responseBuilder.internalError');
    expect(source).not.toMatch(/res\.status\(\d+\)\.json\(\s*\{\s*ok:\s*false/);
  });

  it('unit suite locks 404 + structured + CORS + internal envelopes', () => {
    const unit = read('error.spec.ts');
    expect(unit).toContain('residual 627');
    expect(unit).toContain('HttpResponse');
    expect(unit).toContain("code: 'NOT_FOUND'");
    expect(unit).toContain("code: 'FORBIDDEN'");
    expect(unit).toContain("code: 'INTERNAL_ERROR'");
  });
});
