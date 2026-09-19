import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditPackageShape } from '../server-feature-shape-audit.mjs';

const roots = [];

function makeSourceRoot({ semanticCore = 'domain', omit = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'memoflow-server-shape-'));
  roots.push(root);
  const src = join(root, 'src');
  const rootDirs = ['server', 'api', 'client', 'electron'].filter((dir) => !omit.includes(dir));
  for (const dir of rootDirs) mkdirSync(join(src, dir), { recursive: true });

  if (!omit.includes('server')) {
    for (const dir of ['application', 'transport', 'infrastructure', semanticCore]) {
      if (!omit.includes(`server/${dir}`)) mkdirSync(join(src, 'server', dir), { recursive: true });
    }
    if (!omit.includes('server/index.ts')) writeFileSync(join(src, 'server', 'index.ts'), 'export {};\n');
  }
  return src;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('server feature shape semantic core', () => {
  it('accepts Setting server/preferences without reviving an empty server/domain directory', () => {
    const src = makeSourceRoot({ semanticCore: 'preferences' });
    expect(auditPackageShape('setting', src)).toBeNull();
  });

  it('still requires server/domain for ordinary server-first packages', () => {
    const src = makeSourceRoot({ semanticCore: 'preferences' });
    expect(auditPackageShape('goal', src)).toEqual({
      package: 'goal',
      missing: ['server/domain'],
    });
  });

  it('does not weaken the shared application/transport/infrastructure requirements', () => {
    const src = makeSourceRoot({ semanticCore: 'preferences', omit: ['server/transport'] });
    expect(auditPackageShape('setting', src)).toEqual({
      package: 'setting',
      missing: ['server/transport'],
    });
  });
});
