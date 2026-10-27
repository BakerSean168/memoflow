/**
 * Import boundary lock for @memoflow/data-portability-contracts.
 *
 * The package is the bottom of the data-portability graph: its only runtime
 * dependency is zod. #630 §4.11 settled the profile-import entanglement by
 * keeping the desktop wrapper schemas in @memoflow/desktop-contracts, which
 * now depends on this package — so any `@memoflow/*` import here would close a
 * package cycle (desktop-contracts → data-portability-contracts → …) or turn a
 * business contract into a consumer of another domain.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = join(import.meta.dirname, '..');
const sourceRoot = join(packageRoot, 'src');

function productionSources(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.ts')) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...productionSources(path));
    else if (entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}

describe('data-portability-contracts import boundary', () => {
  it('declares zod as its only package dependency', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(['zod']);
  });

  it('imports no other workspace package from production sources', () => {
    const violations = productionSources(sourceRoot).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(/from\s+'(@memoflow\/[^']+)'/g)].map(
        (match) => `${file}: ${match[1]}`,
      );
    });
    expect(violations).toEqual([]);
  });
});
