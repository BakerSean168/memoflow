import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const readJson = (file) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));

function run(script, args = []) {
  return spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

describe('repository-native Engineering Governance input', () => {
  it('owns rule metadata and references only real repository surfaces', () => {
    const source = readJson('tools/governance/engineering-rules.json');
    const pin = readJson('tools/governance/pinned-engineering-rules.json');

    expect(source.kind).toBe('memoflow.engineering-rules');
    expect(source.rules.map((rule) => rule.code)).toEqual([
      'DDD-001',
      'DDD-002',
      'DDD-003',
      'DDD-004',
      'DDD-005',
    ]);
    for (const rule of source.rules) {
      expect(rule.referencePath).not.toContain('packages/governance');
      expect(existsSync(path.join(ROOT, rule.referencePath)), rule.referencePath).toBe(true);
    }
    expect(pin.sources).toEqual([
      expect.objectContaining({ path: 'tools/governance/engineering-rules.json' }),
    ]);
  });

  it('has no legacy Product bundle in the active adapter closure', () => {
    const active = [
      'tools/governance/engineering-rule-adapter.mjs',
      'tools/governance/lib/engineering-rule-source.mjs',
      'tools/governance/lib/governance-rule-engineering-adapter.mjs',
      'tools/governance/lib/engineering-rule-runner.mjs',
    ]
      .map((file) => readFileSync(path.join(ROOT, file), 'utf8'))
      .join('\n');

    expect(active).not.toContain('published/governance-rule-bundle');
    expect(active).not.toContain('pinned-rule-bundles');
    expect(active).not.toContain('engineering-rule-adapters.json');
    expect(active).not.toContain('@memoflow/governance');
    expect(active).not.toContain("excludedPackages: ['governance']");
  });

  it('passes native source/dependency validation without Product Governance artifacts', () => {
    const source = run('tools/governance/engineering-rule-source-audit.mjs', ['--check']);
    expect(source.status, source.stderr || source.stdout).toBe(0);

    const deps = run('tools/governance/engineering-input-dependency-audit.mjs');
    expect(deps.status, deps.stderr || deps.stdout).toBe(0);
  });
});
