import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GOV-1901 executable reference-feature contract.
 *
 * This gate keeps the package manifest, host composers, real UI surfaces and
 * the two reference documents synchronized with ADR-110. It deliberately
 * tests repository files instead of creating a second architecture manifest.
 */
describe('Governance permanent executable reference feature (GOV-1901)', () => {
  const repoRoot = resolve(__dirname, '../../..');
  const packageRoot = resolve(repoRoot, 'packages/governance');
  const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
    exports: Record<string, unknown>;
  };
  const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

  it('keeps exactly the canonical governance runtime seams', () => {
    expect(Object.keys(packageJson.exports).sort()).toEqual([
      '.',
      './api',
      './client',
      './electron',
    ]);

    for (const retired of [
      'domain-shared',
      'domain-server',
      'domain-client',
      'application-client',
      'infrastructure-client',
      'electron-entry',
      'mocks',
    ]) {
      expect(existsSync(resolve(packageRoot, 'src', retired)), retired).toBe(false);
    }
  });

  it('keeps the full executable vertical slice physically present', () => {
    for (const path of [
      'packages/contracts/src/modules/governance',
      'packages/governance/src/server/domain/aggregates/rule.ts',
      'packages/governance/src/server/domain/entities/rule-revision.ts',
      'packages/governance/src/server/application/governance.application.port.ts',
      'packages/governance/src/server/transport/governance.controller.ts',
      'packages/governance/src/server/infrastructure/adapters/prisma/rule-prisma.repository.ts',
      'packages/governance/src/server/infrastructure/adapters/powersync/rule-powersync.repository.ts',
      'apps/api/src/runtime/compose-governance.ts',
      'apps/desktop/src/main/runtime/compose-governance.ts',
      'packages/app-vue/src/modules/governance/views/GovernanceListView.vue',
      'packages/app-vue/src/modules/governance/views/GovernanceDetailView.vue',
      'packages/app-vue/src/modules/governance/views/RuleEditorView.vue',
      'packages/app-vue/src/modules/governance/views/RevisionHistoryView.vue',
    ]) {
      expect(existsSync(resolve(repoRoot, path)), path).toBe(true);
    }
  });

  it('keeps README and QUICK_REFERENCE aligned with the executable package shape', () => {
    const readme = read('packages/governance/README.md');
    const quickReference = read('docs/governance/QUICK_REFERENCE.md');
    const requiredStatements = [
      '@memoflow/contracts/governance',
      '@memoflow/governance/api',
      '@memoflow/governance/client',
      '@memoflow/governance/electron',
      'apps/api/src/runtime/compose-governance.ts',
      'apps/desktop/src/main/runtime/compose-governance.ts',
      'RuleRevision',
      'Prisma',
      'PowerSync',
      'HTTP',
      'IPC',
    ];

    for (const statement of requiredStatements) {
      expect(readme, `README missing ${statement}`).toContain(statement);
      expect(quickReference, `QUICK_REFERENCE missing ${statement}`).toContain(statement);
    }
  });

  it('keeps host-owned composition explicit instead of composing inside transports', () => {
    const apiComposer = read('apps/api/src/runtime/compose-governance.ts');
    const desktopComposer = read('apps/desktop/src/main/runtime/compose-governance.ts');
    const apiModule = read('packages/governance/src/api/module.ts');
    const electronModule = read('packages/governance/src/electron/index.ts');

    expect(apiComposer).toContain('createGovernancePrismaRepositories');
    expect(apiComposer).toContain('createGovernanceModule');
    expect(apiComposer).toContain('createGovernanceApiModule');
    expect(desktopComposer).toContain('createGovernancePowerSyncRepositories');
    expect(desktopComposer).toContain('createGovernanceModule');
    expect(desktopComposer).toContain('createGovernanceElectronModule');
    expect(apiModule).not.toContain('createGovernancePrismaRepositories(');
    expect(electronModule).not.toContain('createGovernancePowerSyncRepositories(');
  });
});
