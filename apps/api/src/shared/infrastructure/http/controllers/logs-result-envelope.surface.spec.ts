import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Residual 621: POST /logs uses Result/HttpResponse envelope only.
 * No { success: boolean } dual-track body.
 */
const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(here, name), 'utf8');
}

describe('API client logs Result envelope (residual 621)', () => {
  it('logs controller builds HttpResponse via createApiResponseBuilder', () => {
    const source = read('logs.controller.ts');
    expect(source).toContain('Residual 621');
    expect(source).toContain("from '../response-builder.js'");
    expect(source).toContain('createApiResponseBuilder');
    expect(source).toContain('responseBuilder.success');
    expect(source).toContain('responseBuilder.badRequest');
    expect(source).not.toMatch(/success:\s*true/);
    expect(source).not.toMatch(/success:\s*false/);
  });

  it('infrastructure routes still mount POST /logs', () => {
    const routes = readFileSync(
      join(here, '../routes/infrastructure-routes.ts'),
      'utf8',
    );
    expect(routes).toContain("router.post('/logs', logsController.capture)");
  });
});
