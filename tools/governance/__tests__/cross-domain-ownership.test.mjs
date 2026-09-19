import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findCrossDomainOwnershipViolations,
  validateCrossDomainOwnershipManifest,
} from '../lib/cross-domain-ownership.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureRoot() {
  const root = path.join(tmpdir(), `memoflow-cross-domain-${crypto.randomUUID()}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

function baseManifest() {
  return {
    version: 1,
    owners: [
      {
        id: 'owner',
        packagePath: 'packages/owner',
        forbiddenProductionDependencies: ['@memoflow/other'],
        forbiddenProductionImports: ['@memoflow/other'],
        forbiddenConfigurationReferences: [
          { path: 'packages/owner/tsup.config.ts', values: ['@memoflow/other'] },
        ],
      },
    ],
    retiredVocabulary: [{ id: 'retired', token: 'RetiredType', roots: ['packages'] }],
    exceptions: [
      {
        id: 'composition',
        owner: 'host',
        reason: 'Host composition',
        retireBy: 'permanent',
        architectureJustification: 'Explicit host boundary',
      },
    ],
  };
}

describe('cross-domain ownership governance', () => {
  it('detects production dependency, import, config and retired vocabulary residue while ignoring tests/dev dependencies', () => {
    const root = fixtureRoot();
    mkdirSync(path.join(root, 'packages/owner/src/__tests__'), { recursive: true });
    writeFileSync(
      path.join(root, 'packages/owner/package.json'),
      JSON.stringify({
        dependencies: { '@memoflow/other': 'workspace:*' },
        devDependencies: { '@memoflow/other': 'workspace:*' },
      }),
    );
    writeFileSync(
      path.join(root, 'packages/owner/tsup.config.ts'),
      "external: ['@memoflow/other']",
    );
    writeFileSync(
      path.join(root, 'packages/owner/src/index.ts'),
      "import type { Other } from '@memoflow/other'; export const value: Other | null = null; export type RetiredType = string;",
    );
    writeFileSync(
      path.join(root, 'packages/owner/src/__tests__/owner.spec.ts'),
      "import '@memoflow/other'; const value: RetiredType | null = null;",
    );

    const violations = findCrossDomainOwnershipViolations(root, baseManifest());
    expect(violations.map((violation) => violation.kind)).toEqual([
      'forbidden-configuration-reference',
      'production-dependency',
      'production-import',
      'retired-vocabulary',
    ]);
    expect(violations.every((violation) => violation.relativePath.includes('src/__tests__') === false)).toBe(
      true,
    );
  });

  it('requires ownership metadata and permanent architecture justification for exceptions', () => {
    const errors = validateCrossDomainOwnershipManifest({
      version: 1,
      owners: [],
      retiredVocabulary: [],
      exceptions: [{ id: 'missing', owner: 'x', reason: 'y', retireBy: 'permanent' }],
    });

    expect(errors).toContain('manifest.owners must be a non-empty array');
    expect(errors).toContain(
      'exceptions[0].architectureJustification is required for permanent exceptions',
    );
  });
});
