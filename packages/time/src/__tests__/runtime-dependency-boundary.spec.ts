import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

describe('@memoflow/time runtime dependency boundary', () => {
  it('ships runtime-only third-party adapters from dependencies', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as PackageManifest;

    expect(manifest.dependencies?.['@internationalized/date']).toBe('3.11.0');
    expect(manifest.devDependencies?.['@internationalized/date']).toBeUndefined();
    expect(manifest.dependencies?.['@date-fns/tz']).toBe('1.5.0');
    expect(manifest.devDependencies?.['@date-fns/tz']).toBeUndefined();
  });
});
