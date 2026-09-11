import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { validatePublishedBundle } from '../lib/published-rule-bundle.mjs';
import {
  createAutofixProposalReport,
  runMappedEngineeringChecks,
  validateEngineeringAdapterRegistry,
} from '../lib/governance-rule-engineering-adapter.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const bundle = validatePublishedBundle(
  JSON.parse(
    readFileSync(
      path.join(ROOT, 'tools/governance/__fixtures__/governance-rule-bundle.v1.json'),
      'utf8',
    ),
  ),
);
const registry = validateEngineeringAdapterRegistry(
  JSON.parse(
    readFileSync(path.join(ROOT, 'tools/governance/engineering-rule-adapters.json'), 'utf8'),
  ),
);

describe('Governance Rule -> engineering adapter (GOV-1904)', () => {
  it('runs only explicitly mapped checks and leaves unmapped Mandatory rules non-enforcing', async () => {
    const executeCheck = vi.fn(async () => ({
      status: 'passed',
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
    }));
    const report = await runMappedEngineeringChecks({ bundle, registry, executeCheck });

    expect(executeCheck).toHaveBeenCalledTimes(1);
    expect(executeCheck.mock.calls[0][0]).toMatchObject({
      ruleKey: 'DDD-003',
      adapterId: 'package-internal-boundary',
      coverage: 'partial',
    });
    expect(report.summary).toEqual({
      totalRules: 2,
      mappedRules: 1,
      unmappedRules: 1,
      failedChecks: 0,
    });
    expect(report.rules.find((rule) => rule.ruleKey === 'DDD-001')).toMatchObject({
      severity: 'Mandatory',
      mapping: 'unmapped',
      enforcement: 'none',
      check: null,
    });
  });

  it('turns a failed mapped check into a review-only proposal without a mutation command', async () => {
    const report = await runMappedEngineeringChecks({
      bundle,
      registry,
      executeCheck: async () => ({
        status: 'failed',
        exitCode: 1,
        stdout: '',
        stderr: 'violation',
      }),
    });
    const proposals = createAutofixProposalReport({ report, registry });

    expect(proposals.mutationPolicy).toBe('proposal-only');
    expect(proposals.proposals).toHaveLength(1);
    expect(proposals.proposals[0]).toMatchObject({
      ruleKey: 'DDD-003',
      adapterId: 'package-internal-boundary',
      coverage: 'partial',
      directMutation: false,
      kind: 'review-required',
    });
    expect(JSON.stringify(proposals)).not.toMatch(/writeFile|applyPatch|git commit|git add/);
  });

  it('rejects arbitrary executable paths and duplicate rule mappings', () => {
    const unsafe = structuredClone(registry);
    unsafe.adapters[0].checkScript = 'scripts/run-anything.sh';
    expect(() => validateEngineeringAdapterRegistry(unsafe)).toThrow(/audit\.mjs/);

    const duplicate = structuredClone(registry);
    duplicate.adapters.push(structuredClone(duplicate.adapters[0]));
    expect(() => validateEngineeringAdapterRegistry(duplicate)).toThrow(/duplicate/);
  });
});
