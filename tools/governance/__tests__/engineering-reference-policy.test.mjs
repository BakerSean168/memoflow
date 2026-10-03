import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

describe('ADR-113 real-owner architecture policy', () => {
  it('keeps ADR-113 accepted and the AGENT policy on real owner vertical slices', () => {
    const adr = read(
      'docs/architecture/adr/ADR-113-retire-product-governance-runtime-keep-engineering-governance.md',
    );
    const agent = read('AGENT.md');

    expect(adr).toContain('**状态：** 已采纳并实施（GOV-7903）');
    expect(
      read('docs/architecture/adr/ADR-110-governance-permanent-executable-reference-module.md'),
    ).toContain('**状态：** 已被 ADR-113 取代');
    expect(agent).toContain('架构试点规则（真实业务 owner）');
    expect(agent).toContain('最小真实 owner');
    expect(agent).toContain('第二个真实 owner');
    expect(agent).not.toContain('必须先把 `packages/governance` 作为最先的试点模块');
  });

  it('locks the retired Product Governance roots while preserving Engineering Governance', () => {
    const manifest = JSON.parse(read('tools/governance/vnext-retirement-manifest.json'));
    const entry = manifest.entries.find(
      (candidate) => candidate.id === 'product-governance-runtime',
    );

    expect(entry).toMatchObject({
      status: 'active',
      decision: 'ADR-113 / GOV-7903',
    });
    expect(entry.forbiddenPaths).toContain('packages/governance');
    expect(entry.requiredPaths).toContain('tools/governance/engineering-rules.json');

    expect(existsSync(path.join(ROOT, 'packages/governance'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'packages/contracts/src/modules/governance'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'packages/app-vue/src/modules/governance'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'tools/governance/engineering-rules.json'))).toBe(true);
  });

  it('rejects Product runtime imports, models, routes and DI slots in surviving sources', () => {
    const retired =
      /@memoflow\/(?:governance|contracts\/governance|app-vue\/(?:modules\/)?governance)\b|composeGovernance|GovernanceChannels|GovernanceRPCMap|GovernanceEventMap|RULE_SERVICE_KEY|IRuleService|RuleRevision|RuleScalarFieldEnum|RuleDelegate|model\s+Rule\b|rule_revisions|\/api\/v1\/governance|["']\/governance(?:\/|["'])/;
    const visit = (directory) => {
      for (const entry of readdirSync(path.join(ROOT, directory), { withFileTypes: true })) {
        const file = `${directory}/${entry.name}`;
        if (entry.isDirectory()) visit(file);
        else if (/\.(?:[cm]?[jt]sx?|vue|json|prisma|ya?ml)$/.test(entry.name)) {
          expect(read(file), file).not.toMatch(retired);
        }
      }
    };
    expect(JSON.parse(read('graph.json')).graph.nodes).not.toHaveProperty('governance');
    for (const parent of ['apps', 'packages']) {
      for (const entry of readdirSync(path.join(ROOT, parent), { withFileTypes: true })) {
        const manifest = `${parent}/${entry.name}/package.json`;
        if (entry.isDirectory() && existsSync(path.join(ROOT, manifest))) {
          expect(read(manifest), manifest).not.toMatch(
            /@memoflow\/governance|["']\.\/(?:modules\/)?governance["']/,
          );
        }
        const source = `${parent}/${entry.name}/src`;
        if (entry.isDirectory() && existsSync(path.join(ROOT, source))) visit(source);
      }
    }
    for (const file of [
      'packages/powersync-schema/src/index.ts',
      'docker/powersync/sync-config.yaml',
      'packages/database/src/generated/prisma/schema.prisma',
      'pnpm-lock.yaml',
      'graph.json',
    ])
      expect(read(file), file).not.toMatch(retired);
  });

  it('keeps workspace aliases, test registries, delivery and env free of Product slots', () => {
    for (const file of [
      'tsconfig.workspace-src.json',
      'tsconfig.workspace-dist.json',
      'vitest.config.ts',
      'vitest.shared.ts',
      'vitest.workspace-helpers.ts',
      'tools/nx-test-system/src/generators/sync-test-targets/generator.js',
      'tools/test/test-target-governance.mjs',
    ])
      expect(read(file), file).not.toMatch(/["']governance["']|@memoflow\/governance/);
    expect(read('eslint.config.ts')).not.toContain('scope:governance');
    expect(read('Dockerfile.api')).not.toContain('packages/governance');
    for (const file of ['.env', '.env.example', '.env.production', '.env.staging', '.env.test']) {
      expect(read(file), file).not.toMatch(
        /GOVERNANCE_DATABASE_URL|VITE_ENABLE_GOVERNANCE_DEV_SURFACE/,
      );
    }
  });
});
