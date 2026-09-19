import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const SCRIPT = 'tools/governance/governance-rule-bundle-adapter.mjs';
const BUNDLE = 'tools/governance/published/governance-rule-bundle.v1.json';

function run(mode) {
  return spawnSync(process.execPath, [SCRIPT, '--bundle', BUNDLE, '--mode', mode], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

describe('Governance rule bundle CLI (GOV-1904)', () => {
  it('runs the real pinned repository baseline in check mode', () => {
    const result = run('check');
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('rules=5 mapped=1 unmapped=4 failed=0');
    expect(result.stdout).toContain('DDD-003: package-internal-boundary [partial] passed');
    expect(result.stdout).toContain('DDD-001: unmapped (non-enforcing)');
  });

  it('emits a deterministic machine-readable report from the same pinned bundle', () => {
    const result = run('report');
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.summary).toEqual({
      totalRules: 5,
      mappedRules: 1,
      unmappedRules: 4,
      failedChecks: 0,
    });
    expect(report.rules.find((rule) => rule.ruleKey === 'DDD-003')).toMatchObject({
      mapping: 'mapped',
      enforcement: 'partial',
      adapterId: 'package-internal-boundary',
      check: { status: 'passed', exitCode: 0 },
    });
  });

  it('keeps autofix output proposal-only and performs no direct product mutation', () => {
    const result = run('autofix-proposal');
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      kind: 'memoflow.governance-autofix-proposals',
      schemaVersion: 1,
      mutationPolicy: 'proposal-only',
      proposals: [],
    });
  });
});
