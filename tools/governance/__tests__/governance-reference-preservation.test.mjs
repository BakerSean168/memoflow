import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const manifestPath = path.join(ROOT, 'tools', 'governance', 'vnext-retirement-manifest.json');

describe('ADR-110 Governance reference-module preservation', () => {
  it('keeps the executable Governance feature out of every vNext retirement lock', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const forbiddenPaths = manifest.entries.flatMap((entry) => entry.forbiddenPaths ?? []);

    expect(
      forbiddenPaths.filter(
        (entryPath) =>
          entryPath === 'packages/governance' ||
          entryPath.startsWith('packages/governance/') ||
          entryPath === 'packages/contracts/src/modules/governance' ||
          entryPath.startsWith('packages/contracts/src/modules/governance/'),
      ),
    ).toEqual([]);
  });

  it('keeps the reference package and centralized contracts physically present', () => {
    expect(existsSync(path.join(ROOT, 'packages', 'governance', 'package.json'))).toBe(true);
    expect(
      existsSync(
        path.join(ROOT, 'packages', 'contracts', 'src', 'modules', 'governance', 'index.ts'),
      ),
    ).toBe(true);
  });
});
