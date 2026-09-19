import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('retired Editor portability remains absent', () => {
  const repoRoot = resolve(__dirname, '../../../../../../../');

  it('does not retain an Editor package or portability capability', () => {
    expect(existsSync(resolve(repoRoot, 'packages/editor'))).toBe(false);
    const api = readFileSync(resolve(repoRoot, 'apps/api/src/server.ts'), 'utf8');
    const desktop = readFileSync(resolve(repoRoot, 'apps/desktop/src/main/main.ts'), 'utf8');
    const portabilityBlock = (source: string): string => {
      const start = source.indexOf('portableCapabilities: [');
      expect(start).toBeGreaterThanOrEqual(0);
      return source.slice(start, source.indexOf('],', start) + 2);
    };
    expect(portabilityBlock(api)).not.toMatch(/editor/i);
    expect(portabilityBlock(desktop)).not.toMatch(/editor/i);
  });
});
