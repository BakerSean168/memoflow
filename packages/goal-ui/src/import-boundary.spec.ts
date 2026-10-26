import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(file);
    return /\.(ts|vue)$/.test(entry.name) && !/\.(spec|test|stories)\.ts$/.test(entry.name)
      ? [file]
      : [];
  });
}

describe('Goal UI dependency boundary', () => {
  it('uses host capabilities without importing host or other feature implementations', () => {
    const invalid = productionFiles(import.meta.dirname).flatMap((file) => {
      const imports = [
        ...readFileSync(file, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g),
      ];
      return imports
        .filter(
          ([, name]) =>
            name.startsWith('@memoflow/app-vue') ||
            /^@memoflow\/(?:goal|ai|relation)(?:\/|$)/.test(name) ||
            (name.startsWith('.') &&
              !resolve(file, '@goal-ui-test-host/modules', name).startsWith(import.meta.dirname + '/')),
        )
        .map(([, name]) => `${file}: ${name}`);
    });
    expect(invalid).toEqual([]);
  });
});
