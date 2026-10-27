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

describe('Task UI dependency boundary', () => {
  it('uses host capabilities without importing app-vue or escaping the package root', () => {
    const invalid = productionFiles(import.meta.dirname).flatMap((file) => {
      const imports = [
        ...readFileSync(file, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g),
      ];
      return imports
        .filter(
          ([, name]) =>
            name.startsWith('@memoflow/app-vue') ||
            (name.startsWith('.') &&
              !resolve(file, '@task-ui-test-host/modules', name).startsWith(
                import.meta.dirname + '/',
              )),
        )
        .map(([, name]) => `${file}: ${name}`);
    });
    expect(invalid).toEqual([]);
  });
});
