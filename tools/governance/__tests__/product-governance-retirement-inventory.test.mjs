import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auditInventory,
  validateInventory,
} from '../product-governance-retirement-inventory-audit.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const manifest = JSON.parse(
  readFileSync(
    path.join(ROOT, 'tools/governance/product-governance-retirement-inventory.json'),
    'utf8',
  ),
);
const files = manifest.entries.flatMap((entry) => entry.paths);
let fixture;
let outside;
function changed(mutate) {
  const copy = structuredClone(manifest);
  mutate(copy);
  return validateInventory(copy).join('\n');
}

describe('GOV-7901 non-destructive inventory drift lock', () => {
  beforeAll(() => {
    fixture = mkdtempSync(path.join(tmpdir(), 'memoflow-gov7901-'));
    outside = mkdtempSync(path.join(tmpdir(), 'memoflow-gov7901-outside-'));
    for (const file of files) {
      mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
      writeFileSync(path.join(fixture, file), '');
    }
  });
  afterAll(() => {
    rmSync(fixture, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  it('validates the real inventory and file resolution', () => {
    const liveFiles = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: ROOT, encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
    )
      .split('\0')
      .filter(Boolean);
    expect(auditInventory(ROOT, manifest, liveFiles)).toEqual([]);
  });
  it('rejects destructive gate state and weakened known roots', () => {
    expect(
      changed((m) => {
        m.decisionGate.destructiveAllowed = true;
      }),
    ).toContain('destructiveAllowed=false');
    expect(
      changed((m) => {
        m.coverage.productRoots.pop();
      }),
    ).toContain('must not be weakened');
    for (const field of ['referencePattern', 'binaryReferencePattern']) {
      expect(
        changed((m) => {
          m.coverage[field] = 'governance';
        }),
      ).toContain('must not be weakened');
    }
  });
  it('rejects unknown classification, duplicate IDs and missing metadata', () => {
    expect(
      changed((m) => {
        m.entries[0].classification = 'DELETE';
      }),
    ).toContain('unsupported classification');
    expect(
      changed((m) => {
        m.entries[1].id = m.entries[0].id;
      }),
    ).toContain('duplicate id');
    for (const field of [
      'owner',
      'surface',
      'dependencyDirection',
      'rationale',
      'gov7902',
      'gov7903',
      'verificationQuery',
      'symbols',
    ]) {
      expect(
        changed((m) => {
          delete m.entries[0][field];
        }),
      ).toContain(`missing ${field}`);
    }
  });
  it('rejects malformed metadata objects and generated markers', () => {
    expect(validateInventory(null)).not.toEqual([]);
    expect(
      changed((m) => {
        m.entries.push(null);
      }),
    ).toContain('Invalid entry');
    expect(
      changed((m) => {
        m.entries.find((e) => e.id === 'generated-prisma-client').artifact = 'source';
      }),
    ).toContain('invalid source/generated marker');
  });
  it('uses only source artifacts as source of truth', () => {
    for (const artifact of ['source', 'fixture', 'generated', 'historical']) {
      expect(
        changed((m) => {
          m.entries[0].artifact = artifact;
          m.entries[0].sourceOfTruth = artifact === 'source';
        }),
      ).toBe('');
      expect(
        changed((m) => {
          m.entries[0].artifact = artifact;
          m.entries[0].sourceOfTruth = artifact !== 'source';
        }),
      ).toContain('invalid source/generated marker');
    }
  });
  it('allows an exact root nx.json reference to be classified', () => {
    const file = 'nx.json';
    writeFileSync(path.join(fixture, file), '{"description":"Governance build manifest"}');
    expect(auditInventory(fixture, manifest, [...files, file]).join('\n')).toContain(
      `${file}: unclassified`,
    );
    const classified = structuredClone(manifest);
    classified.entries.find((e) => e.id === 'workspace-build-containers').paths.push(file);
    expect(validateInventory(classified)).toEqual([]);
    expect(auditInventory(fixture, classified, [...files, file])).toEqual([]);
    rmSync(path.join(fixture, file));
  });
  it('keeps the main gate cacheable with one non-cacheable inventory dependency', () => {
    const { targets } = JSON.parse(readFileSync(path.join(ROOT, 'project.json'), 'utf8'));
    const name = 'product-governance-retirement-inventory-check';
    expect(targets['governance-check'].cache).toBe(true);
    expect(targets['governance-check'].dependsOn.filter((dep) => dep === name)).toEqual([name]);
    expect(targets['governance-check'].options.command).not.toContain(
      'product-governance-retirement-inventory-audit.mjs',
    );
    expect(targets[name].inputs).toEqual([
      '{workspaceRoot}/tools/governance/product-governance-retirement-inventory.json',
      '{workspaceRoot}/tools/governance/product-governance-retirement-inventory-audit.mjs',
      '{workspaceRoot}/tools/governance/__tests__/product-governance-retirement-inventory.test.mjs',
    ]);
    expect(targets[name].executor).toBe('nx:run-commands');
    expect(targets[name].cache).toBe(false);
    expect(targets[name].options.command).toBe(
      'node ./tools/governance/product-governance-retirement-inventory-audit.mjs',
    );
  });
  it('rejects duplicate paths even with the same classification and conflicting owners', () => {
    expect(
      changed((m) => {
        m.entries[0].paths.push(m.entries[0].paths[0]);
      }),
    ).toContain('duplicate/contradictory');
    expect(
      changed((m) => {
        m.entries[1].paths.push(m.entries[0].paths[0]);
      }),
    ).toContain('duplicate/contradictory');
  });
  it('rejects traversal, absolute paths, globs, disallowed roots and backslashes', () => {
    for (const file of [
      '../outside',
      '/tmp/outside',
      'packages/**',
      'secrets/key.json',
      'packages/../AGENT.md',
      'packages\\file.ts',
      'packages//file.ts',
      '.',
      '..',
      'nx.json?',
      'nx.json\0',
      'C:/outside',
      'packages/{one,two}.ts',
      'packages/new\nfile.ts',
      'packages/new\tfile.ts',
    ]) {
      expect(
        changed((m) => {
          m.entries[0].paths.push(file);
        }),
      ).toContain('invalid/disallowed path');
    }
  });
  it('protects Product roots, KEEP_ENGINEERING boundaries and exact composition coverage', () => {
    expect(
      changed((m) => {
        m.entries.find((e) => e.id === 'product-server-domain').classification = 'KEEP_ENGINEERING';
      }),
    ).toContain('Product-only root must be RETIRE');
    expect(
      changed((m) => {
        m.entries.find((e) => e.id === 'shared-domain-and-helper-evidence').classification =
          'KEEP_ENGINEERING';
      }),
    ).toContain('outside KEEP_ENGINEERING');
    expect(
      changed((m) => {
        m.entries.find((e) => e.id === 'product-reference-tools').classification =
          'KEEP_ENGINEERING';
      }),
    ).toContain('required RETIRE');
    expect(
      changed((m) => {
        m.entries.find((e) => e.id === 'powersync-shared-projection').paths.pop();
      }),
    ).toContain('required SHARED coverage missing');
  });
  it('locks the migration coupling while keeping independent engineering runners', () => {
    for (const id of [
      'engineering-bundle-consumer',
      'engineering-rule-metadata',
      'published-product-snapshot',
      'bundle-bridge-tests',
      'live-reference-documentation',
      'reference-preservation-policy',
      'governance-check-bridge',
    ]) {
      expect(
        changed((m) => {
          m.entries.find((e) => e.id === id).classification = 'SHARED';
        }),
      ).toContain('required MIGRATE_FIRST');
    }
    expect(
      changed((m) => {
        m.entries.find((e) => e.id === 'bundle-bridge-tests').gov7902 = 'None';
      }),
    ).toContain('blocker B3');
    for (const gov7902 of [null, [], {}, 42]) {
      expect(
        changed((m) => {
          m.entries.find((e) => e.id === 'bundle-bridge-tests').gov7902 = gov7902;
        }),
      ).toContain('missing gov7902');
    }
    expect(
      changed((m) => {
        m.entries.find((e) => e.id === 'engineering-generic-audits').classification = 'RETIRE';
      }),
    ).toContain('required KEEP_ENGINEERING');
  });
  it('fails missing inventoried paths and escaping symlinks', () => {
    const file = 'packages/governance/src/index.ts';
    const full = path.join(fixture, file);
    rmSync(full);
    expect(auditInventory(fixture, manifest, files).join('\n')).toContain(
      'inventory path no longer resolves',
    );
    writeFileSync(path.join(outside, 'index.ts'), '');
    symlinkSync(path.join(outside, 'index.ts'), full);
    expect(auditInventory(fixture, manifest, files).join('\n')).toContain(
      'not a repository-owned file',
    );
    rmSync(full);
    writeFileSync(full, '');
  });
  it('detects new Product files without matching text, new imports and schema references', () => {
    const additions = [
      ['packages/governance/src/new.ts', 'export const x = 1;'],
      ['apps/web/src/new.ts', "import '@memoflow/governance/client';"],
      ['apps/api/src/new.ts', "const table = 'rule_revisions';"],
      ['apps/web/src/new.json', '{"route":"/governance/rules"}'],
      ['docker/new.sql', 'SELECT * FROM rules;'],
      ['apps/api/src/new.bin', Buffer.from('\0@memoflow/governance/api\0')],
      ['apps/web/src/new-id.ts', "import type { RuleId } from '@memoflow/contracts/primitives';"],
      ['packages/database/prisma/schema/new.prisma', 'model GovernanceRule {}'],
      ['docs/governance/new.md', 'Governance policy'],
      ['docs/standards/new.md', 'Governance standard'],
      ['docs/plan/active/new.md', 'Governance active plan'],
    ];
    for (const [file, content] of additions) {
      mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
      writeFileSync(path.join(fixture, file), content);
      expect(auditInventory(fixture, manifest, [...files, file]).join('\n')).toContain(
        `${file}: unclassified`,
      );
      rmSync(path.join(fixture, file));
    }
  });
  it('rejects unclassified escaping symlinks before reading them, including evidence roots', () => {
    writeFileSync(path.join(outside, 'source.ts'), "import '@memoflow/governance';");
    for (const file of ['apps/web/src/new.ts', 'docs/plan/archive/new.md']) {
      mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
      symlinkSync(path.join(outside, 'source.ts'), path.join(fixture, file));
      expect(auditInventory(fixture, manifest, [...files, file]).join('\n')).toContain(
        `${file}: not a repository-owned file`,
      );
      rmSync(path.join(fixture, file));
    }
    for (const file of [
      '../outside',
      '/tmp/outside',
      'apps/../outside',
      'apps\\outside',
      'C:/outside',
    ]) {
      expect(auditInventory(fixture, manifest, [...files, file]).join('\n')).toContain(
        'invalid/disallowed live path',
      );
    }
  });
  it('keeps representative runtime owners and generated Prisma artifacts correctly classified', () => {
    const owner = (file) => manifest.entries.find((entry) => entry.paths.includes(file));
    for (const file of [
      'packages/governance/src/api/module.ts',
      'packages/database/prisma/schema/governance.prisma',
      'apps/api/src/runtime/compose-governance.ts',
    ]) {
      expect(owner(file).classification).toBe('RETIRE');
    }
    for (const file of [
      'apps/api/src/server.ts',
      'packages/app-vue/src/router/index.ts',
      'packages/contracts/src/shared/protocol.ts',
      'apps/desktop/src/preload/allowed-channels.ts',
      'packages/powersync-schema/src/index.ts',
    ]) {
      expect(owner(file).classification).toBe('SHARED');
    }
    expect(
      changed((m) => {
        const e = m.entries.find((e) => e.id === 'generated-prisma-client');
        e.artifact = 'source';
        e.sourceOfTruth = true;
      }),
    ).toContain('SHARED/generated');
    const bridge = manifest.entries.find((entry) => entry.id === 'bundle-bridge-tests');
    expect(bridge.artifact).toBe('source');
    expect(bridge.sourceOfTruth).toBe(true);
    expect(bridge.pathMarkers[bridge.paths[0]]).toEqual({
      artifact: 'fixture',
      sourceOfTruth: false,
    });
    for (const marker of [
      null,
      [],
      { artifact: 'fixture', sourceOfTruth: true },
      { artifact: 'unknown', sourceOfTruth: false },
    ]) {
      expect(
        changed((m) => {
          m.entries.find((e) => e.id === 'bundle-bridge-tests').pathMarkers[bridge.paths[0]] =
            marker;
        }),
      ).toContain('invalid path marker');
    }
    expect(
      changed((m) => {
        m.entries[0].pathMarkers = { 'nx.json': { artifact: 'source', sourceOfTruth: true } };
      }),
    ).toContain('invalid path marker');
  });
  it('permits new historical evidence and generated report mentions', () => {
    for (const root of [
      'docs/architecture/adr',
      'docs/analysis',
      'docs/audit',
      'docs/plan/archive',
      'docs/plan/handoffs',
      'reports',
    ]) {
      const file = `${root}/new-governance.md`;
      mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
      writeFileSync(path.join(fixture, file), 'Historical Governance / rule_revisions evidence');
      expect(auditInventory(fixture, manifest, [...files, file])).toEqual([]);
      rmSync(path.join(fixture, file));
    }
  });
  it('still requires existing historical evidence paths to resolve', () => {
    const file = manifest.entries.find((e) => e.id === 'historical-doc-evidence').paths[0];
    rmSync(path.join(fixture, file));
    expect(auditInventory(fixture, manifest, files).join('\n')).toContain(
      `${file}: inventory path no longer resolves`,
    );
    writeFileSync(path.join(fixture, file), '');
  });
  it('ignores unrelated files and binary contents', () => {
    writeFileSync(path.join(fixture, 'unrelated.ts'), 'export const shared = true;');
    writeFileSync(path.join(fixture, 'image.bin'), Buffer.from('\0governance'));
    const unrelated = ['apps/mobile/src/app/tasks/[id].tsx', 'deployment/production/new.json'];
    for (const file of unrelated) {
      mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
      writeFileSync(path.join(fixture, file), 'const rule = { rules: [] };');
    }
    expect(
      auditInventory(fixture, manifest, [...files, 'unrelated.ts', 'image.bin', ...unrelated]),
    ).toEqual([]);
    for (const file of unrelated) rmSync(path.join(fixture, file));
  });
});
