import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findVnextRetirementViolations,
  validateVnextRetirementManifest,
} from '../lib/vnext-retirement.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot() {
  const root = path.join(tmpdir(), `memoflow-vnext-retirement-${crypto.randomUUID()}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

describe('vNext retirement governance', () => {
  it('ignores staged locks until their replacement ticket closes', () => {
    const root = tempRoot();
    mkdirSync(path.join(root, 'packages/legacy'), { recursive: true });
    const manifest = {
      version: 1,
      entries: [
        {
          id: 'legacy',
          status: 'staged',
          decision: 'ADR-test',
          forbiddenPaths: ['packages/legacy'],
        },
      ],
    };

    expect(validateVnextRetirementManifest(manifest)).toEqual([]);
    expect(findVnextRetirementViolations(root, manifest)).toEqual([]);
  });

  it('fails an active lock when a retired surface is reintroduced', () => {
    const root = tempRoot();
    mkdirSync(path.join(root, 'packages/retired'), { recursive: true });
    writeFileSync(path.join(root, 'packages/retired/index.ts'), 'export {};');
    const manifest = {
      version: 1,
      entries: [
        {
          id: 'retired',
          status: 'active',
          decision: 'ADR-test',
          forbiddenPaths: ['packages/retired'],
        },
      ],
    };

    expect(findVnextRetirementViolations(root, manifest)).toEqual([
      {
        id: 'retired',
        decision: 'ADR-test',
        relativePath: 'packages/retired',
      },
    ]);
  });

  it('rejects malformed or duplicate manifest entries', () => {
    const errors = validateVnextRetirementManifest({
      version: 2,
      entries: [
        { id: 'dup', status: 'unknown', decision: '', forbiddenPaths: [] },
        { id: 'dup', status: 'active', decision: 'ADR-test', forbiddenPaths: ['x'] },
      ],
    });

    expect(errors).toContain('manifest.version must equal 1');
    expect(errors.some((error) => error.includes('duplicates dup'))).toBe(true);
    expect(errors.some((error) => error.includes('status must be active or staged'))).toBe(true);
  });
});
