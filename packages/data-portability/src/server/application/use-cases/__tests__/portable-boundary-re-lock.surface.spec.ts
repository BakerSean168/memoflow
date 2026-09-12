import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 885: retired Editor vs server-held disclosure boundary re-lock.
 * Re-asserts stage-6 residual 193/303/539 invariants with Residual 885 markers.
 * Does not flip §13.2 checkboxes; OAuth / multi-engine Agent / full PR gate remain open.
 */
describe('portable boundary re-lock (residual 885)', () => {
  const repoRoot = resolve(__dirname, '../../../../../../../');

  const importSafety = readFileSync(
    resolve(repoRoot, 'packages/contracts/src/modules/data-portability/rules/import-safety.ts'),
    'utf8',
  );
  const exportDisclosure = readFileSync(
    resolve(__dirname, '../export-server-held-data-disclosure.use-case.ts'),
    'utf8',
  );
  const ipcChannels = readFileSync(
    resolve(repoRoot, 'packages/contracts/src/electron/ipc-channels.ts'),
    'utf8',
  );
  const powersyncTableMapping = readFileSync(
    resolve(repoRoot, 'apps/api/src/modules/powersync/table-mapping.ts'),
    'utf8',
  );
  const desktopPowersync = readFileSync(
    resolve(repoRoot, 'apps/desktop/src/main/database/powersync.ts'),
    'utf8',
  );
  const repositoryRoutesIndex = readFileSync(
    resolve(repoRoot, 'packages/repository/src/api/routes/index.ts'),
    'utf8',
  );
  const appShellStore = readFileSync(
    resolve(repoRoot, 'packages/app-vue/src/layouts/shell/useAppShellStore.ts'),
    'utf8',
  );
  const apiServer = readFileSync(resolve(repoRoot, 'apps/api/src/server.ts'), 'utf8');
  const desktopMain = readFileSync(resolve(repoRoot, 'apps/desktop/src/main/main.ts'), 'utf8');
  const electronModule = readFileSync(
    resolve(repoRoot, 'packages/data-portability/src/electron/index.ts'),
    'utf8',
  );

  it('keeps surviving Residual 885 boundaries while retired Editor surfaces stay deleted', () => {
    expect(importSafety).toContain('Residual 885');
    expect(exportDisclosure).toContain('Residual 885');
    expect(ipcChannels).toContain('Residual 885');
    expect(repositoryRoutesIndex).toContain('Residual 885');
    expect(appShellStore).toContain('Residual 885');
    expect(existsSync(resolve(repoRoot, 'packages/editor'))).toBe(false);
    expect(apiServer).not.toContain('@memoflow/editor');
    expect(desktopMain).not.toContain('@memoflow/editor');
    expect(apiServer).not.toContain('createEditorApiModule');
    expect(desktopMain).not.toContain('createEditorElectronModule');
  });

  it('keeps server-held disclosure Web-only and not-importable (no Desktop IPC channel)', () => {
    expect(importSafety).toContain("kind === 'memoflow.server-held-data-disclosure'");
    expect(importSafety).toContain('not importable');
    expect(importSafety).toContain('memoflow.user-data-export');
    expect(exportDisclosure).toContain("kind: 'memoflow.server-held-data-disclosure'");
    expect(exportDisclosure).toContain("importMode: 'not-importable'");

    const channelsBlock = ipcChannels.slice(
      ipcChannels.indexOf('export const DataPortabilityChannels'),
      ipcChannels.indexOf('export const WindowChannels'),
    );
    expect(channelsBlock).toContain("EXPORT: 'data-portability:export'");
    expect(channelsBlock).toContain("IMPORT: 'data-portability:import'");
    expect(channelsBlock).not.toMatch(/DISCLOSURE|server-held|serverHeld/i);
    expect(electronModule).not.toMatch(
      /exportServerHeldDataDisclosure|server-held-data-disclosure/,
    );
  });

  it('keeps retired Editor out of PowerSync while preserving knowledge-only routes + /note strip', () => {
    expect(powersyncTableMapping).not.toContain("'editor_workspaces'");
    expect(powersyncTableMapping).not.toContain('portable backup');
    expect(desktopPowersync).not.toContain("'editor_workspaces'");
    expect(desktopPowersync).not.toContain('portable backup continuity');
    expect(repositoryRoutesIndex).toContain('registerKnowledgeRepositoryConnectionRoutes');
    expect(repositoryRoutesIndex).not.toMatch(/registerFolderRoutes|registerResourceRoutes/);
    expect(appShellStore).toContain("tab.route === '/note'");
    expect(appShellStore).toContain("tab.route.startsWith('/note/')");
    expect(appShellStore).toContain('sanitizeLegacyTabs');
  });
});
