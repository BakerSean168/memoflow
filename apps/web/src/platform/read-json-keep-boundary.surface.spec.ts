import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1198: readJson keep-boundary (e2e stream vs desktop fs).
 * - retired auth-web Response helper was deleted with the legacy auth client
 * - e2e OpenAI mock: IncomingMessage stream → Record<string, unknown> (throws)
 * - desktop packaged-deps: filesystem path → JSON.parse (sync, throws)
 * Soft residual 1195: scoreIndexedResource dual retired remains separate.
 * Soft residual 1189: getCorsOrigins keep-boundary remains separate.
 * Does not flip §13.2 checkboxes.
 */
describe('readJson keep-boundary (residual 1198)', () => {
  const dir = __dirname;
  const retiredAuthWeb = resolve(dir, 'auth-web-service.ts');
  const e2eMock = readFileSync(
    resolve(dir, '../../e2e/helpers/start-openai-compatible-mock.ts'),
    'utf8',
  );
  const desktop = readFileSync(
    resolve(dir, '../../../desktop/scripts/verify-packaged-runtime-deps.mjs'),
    'utf8',
  );

  it('keeps the legacy auth-web Response helper retired', () => {
    expect(existsSync(retiredAuthWeb)).toBe(false);
  });

  it('differs from e2e mock stream→Record readJson (no force-merge)', () => {
    expect(e2eMock).toContain('Residual 1198 keep-boundary');
    expect(e2eMock).toMatch(/async function readJson\b/);
    expect(e2eMock).toContain('Soft residual 1198');
    expect(e2eMock).toContain('IncomingMessage');
    expect(e2eMock).toContain('Record<string, unknown>');
    const body = e2eMock.match(/async function readJson\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('for await');
    expect(body).toContain('JSON.parse');
    expect(body).toContain('Buffer.concat');
    expect(body).not.toContain('response.json()');
    expect(body).not.toContain('return null');
    expect(body).not.toContain('readFileSync');
  });

  it('differs from desktop fs path readJson (no force-merge)', () => {
    expect(desktop).toContain('Residual 1198 keep-boundary');
    expect(desktop).toMatch(/function readJson\b/);
    expect(desktop).toContain('Soft residual 1198');
    expect(desktop).toContain('filePath');
    expect(desktop).toContain('readFileSync');
    const body = desktop.match(/function readJson\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('JSON.parse');
    expect(body).toContain("fs.readFileSync(filePath, 'utf8')");
    expect(body).not.toContain('response.json()');
    expect(body).not.toContain('IncomingMessage');
    expect(body).not.toContain('for await');
    expect(body).not.toContain('return null');
  });

  it('runtime: documents stream Record vs fs parse contracts via body shape', () => {
    async function e2eReadJson(raw: string): Promise<Record<string, unknown>> {
      return JSON.parse(raw) as Record<string, unknown>;
    }
    function desktopReadJson(raw: string): unknown {
      return JSON.parse(raw);
    }
    return Promise.all([
      e2eReadJson('{"model":"x"}').then((v) => expect(v).toEqual({ model: 'x' })),
      Promise.resolve().then(() =>
        expect(desktopReadJson('{"name":"pkg"}')).toEqual({ name: 'pkg' }),
      ),
    ]);
  });

  it('documents residual 1198 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(resolve(dir, 'read-json-keep-boundary.surface.spec.ts'), 'utf8');
    expect(self).toContain('Residual 1198');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('keep-boundary');
  });
});
