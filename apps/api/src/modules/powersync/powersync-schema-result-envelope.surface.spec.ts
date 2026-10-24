import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Residual 629: GET /powersync/schema uses Result/HttpResponse envelope only.
 * Partial dual-track `{ ok, data }` without HttpResponse fields is retired.
 */
const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(here, name), 'utf8');
}

describe('PowerSync /schema Result envelope (residual 629)', () => {
  it('schema route builds HttpResponse via createApiResponseBuilder', () => {
    const source = read('module.ts');
    expect(source).toContain('Residual 629');
    expect(source).toContain('createApiResponseBuilder');
    expect(source).toContain("psRouter.get('/schema'");
    expect(source).toContain('responseBuilder.success');
    expect(source).not.toMatch(
      /psRouter\.get\('\/schema'[\s\S]*?res\.json\(\s*\{\s*ok:\s*true/,
    );
  });

  it('unit suite locks schema HttpResponse envelope', () => {
    const unit = read('module.spec.ts');
    expect(unit).toContain('residual 629');
    expect(unit).toContain('/api/v1/powersync/schema');
    expect(unit).toContain('HttpResponse');
  });
});
