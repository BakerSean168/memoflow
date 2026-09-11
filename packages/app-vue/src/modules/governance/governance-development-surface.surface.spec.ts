import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** GOV-1902 anti-drift lock for the real development/diagnostic workbench wiring. */
describe('Governance development surface wiring (GOV-1902)', () => {
  const repoRoot = resolve(__dirname, '../../../../..');
  const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

  it('keeps the Governance route real while navigation visibility stays policy-owned', () => {
    const router = read('packages/app-vue/src/modules/governance/router/index.ts');
    const policy = read('packages/app-vue/src/modules/governance/governance-surface-policy.ts');

    expect(router).toContain("path: '/governance'");
    expect(router).toContain("name: 'governance-list'");
    expect(router).toContain("import('../views/GovernanceListView.vue')");
    expect(router).toContain('showInNav: governanceSurfacePolicy.navigationVisible');
    expect(policy).toContain('routeRegistered: true');
    expect(policy).toContain('import.meta.env.DEV');
    expect(policy).toContain("VITE_ENABLE_GOVERNANCE_DEV_SURFACE === 'true'");
  });

  it('keeps the Note shell connected without advertising Governance by default in production', () => {
    const segmentBar = read(
      'packages/app-vue/src/modules/repository/components/NoteSegmentBar.vue',
    );

    expect(segmentBar).toContain('shouldRenderGovernanceSegment(props.active)');
    expect(segmentBar).toContain("value: 'governance'");
    expect(segmentBar).toContain("label: t('repository.segments.governance')");
  });

  it('defaults production, staging and test navigation to hidden while documenting the opt-in flag', () => {
    for (const envFile of ['.env.production', '.env.staging', '.env.test']) {
      expect(read(envFile), envFile).toContain('VITE_ENABLE_GOVERNANCE_DEV_SURFACE=false');
    }
    expect(read('.env.example')).toContain('VITE_ENABLE_GOVERNANCE_DEV_SURFACE=false');
  });

  it('keeps a real create-update-revision smoke path in the Vue module', () => {
    const smoke = read(
      'packages/app-vue/src/modules/governance/governance-development-smoke.spec.ts',
    );
    for (const view of [
      'GovernanceListView',
      'RuleEditorView',
      'GovernanceDetailView',
      'RevisionHistoryView',
    ]) {
      expect(smoke).toContain(view);
    }
    expect(smoke).toContain("revisionNumber: 2, changeType: 'Updated'");
  });
});
