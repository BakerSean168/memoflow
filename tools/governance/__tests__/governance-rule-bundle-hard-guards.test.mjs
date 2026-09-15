import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runPackageInternalBoundaryAudit } from '../lib/package-internal-boundary-runner.mjs';
import { validatePublishedBundle } from '../lib/published-rule-bundle.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const PUBLISHED_BUNDLE = 'tools/governance/published/governance-rule-bundle.v1.json';
const read = (relPath) => readFileSync(path.join(ROOT, relPath), 'utf8');

describe('GOV-1904 engineering bridge hard guards', () => {
  it('keeps the shared package-boundary runner behavior green for the current repository', () => {
    const report = runPackageInternalBoundaryAudit(ROOT);
    expect(report.passed).toBe(true);
    expect(report.auditedFiles).toBeGreaterThan(0);
    expect(report.violations).toEqual([]);
  });

  it('keeps bundle engineering code disconnected from live Governance persistence/network and direct mutation', () => {
    const sources = [
      read('tools/governance/governance-rule-bundle-adapter.mjs'),
      read('tools/governance/lib/published-rule-bundle.mjs'),
      read('tools/governance/lib/governance-rule-engineering-adapter.mjs'),
    ].join('\n');
    expect(sources).not.toMatch(
      /from\s+['"]@memoflow\/database|new\s+PrismaClient|from\s+['"][^'"]*powersync|GovernanceClientPort\s*[;,{]/i,
    );
    expect(sources).not.toMatch(/\bfetch\s*\(|from\s+['"](?:node:)?https?/);
    expect(sources).not.toMatch(
      /writeFile|appendFile|rmSync|unlinkSync|renameSync|git commit|git add/,
    );
  });

  it('adds the pinned bundle bridge to governance-check without replacing standalone repository audits', () => {
    const rootProject = JSON.parse(read('project.json'));
    const target = rootProject.targets['governance-check'];
    const command = target.options.command;

    expect(command).toContain('node ./tools/governance/package-internal-boundary-audit.mjs');
    expect(command).toContain(
      `node ./tools/governance/governance-rule-bundle-adapter.mjs --bundle ${PUBLISHED_BUNDLE} --mode check`,
    );
    expect(target.inputs).toEqual(
      expect.arrayContaining([
        '{workspaceRoot}/tools/governance/governance-rule-bundle-adapter.mjs',
        '{workspaceRoot}/tools/governance/engineering-rule-adapters.json',
        '{workspaceRoot}/tools/governance/pinned-rule-bundles.json',
        '{workspaceRoot}/tools/governance/published/**/*.json',
      ]),
    );
    expect(
      existsSync(path.join(ROOT, 'tools/governance/package-internal-boundary-audit.mjs')),
    ).toBe(true);
  });

  it('pins the real repository baseline by semantic hash and preserves Governance out of retirement manifests', () => {
    const pins = JSON.parse(read('tools/governance/pinned-rule-bundles.json'));
    const published = validatePublishedBundle(JSON.parse(read(PUBLISHED_BUNDLE)));
    const productionPin = pins.bundles.find((entry) => entry.path === PUBLISHED_BUNDLE);

    expect(pins).toMatchObject({ schemaVersion: 1 });
    expect(productionPin).toMatchObject({
      path: PUBLISHED_BUNDLE,
      semanticHash: published.semanticHash,
      purpose: 'repository-engineering-baseline',
    });
    expect(published.rules.map((rule) => rule.code)).toEqual([
      'DDD-001',
      'DDD-002',
      'DDD-003',
      'DDD-004',
      'DDD-005',
    ]);

    const retirement = read('tools/governance/vnext-retirement-manifest.json');
    expect(retirement).not.toContain('packages/governance');
    expect(retirement).not.toContain('packages/contracts/src/modules/governance');
  });
});
