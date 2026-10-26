import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(file);
    if (!entry.name.endsWith('.ts') || /\.(?:test|spec)\.ts$/.test(entry.name)) return [];
    return [file];
  });
}

describe('Goal client independent runtime boundary', () => {
  it('exports the HTTP and IPC client factories', async () => {
    const client = await import('./index');
    expect(typeof client.createGoalHttpClient).toBe('function');
    expect(typeof client.createGoalIpcClient).toBe('function');
  });

  it('forbids importing Goal server implementation from any client source', () => {
    const invalid = productionFiles(import.meta.dirname).flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      const imports = Array.from(
        content.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g),
        (match) => match[1],
      );
      return imports
        .filter(
          (value) =>
            value === '@memoflow/goal' ||
            value.startsWith('@memoflow/goal/') ||
            /(?:^|\/)server(?:\/|$)/.test(value),
        )
        .map((value) => `${file}: ${value}`);
    });
    expect(invalid).toEqual([]);

    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
    );
    expect(Object.keys(manifest.dependencies ?? {})).not.toContain('@memoflow/goal');
  });
});
