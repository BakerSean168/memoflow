import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * EDITOR-1701 lock: the retired Editor bounded context is not a V2/V3
 * portability capability. EDITOR-1702 also removes the legacy persistence;
 * no business-backup export/import path may depend on any Editor residue.
 */
describe('EDITOR-1701 editor portability retirement', () => {
  const repoRoot = resolve(__dirname, '../../../../../../../');
  const contractsDir = resolve(repoRoot, 'packages/contracts/src/modules/data-portability/dtos');
  const portableUserData = readFileSync(resolve(contractsDir, 'portable-user-data.dto.ts'), 'utf8');
  const exportableModules = readFileSync(resolve(contractsDir, 'exportable-module.dto.ts'), 'utf8');
  const exportUseCase = readFileSync(resolve(__dirname, '../export-user-data.use-case.ts'), 'utf8');
  const importUseCase = readFileSync(resolve(__dirname, '../import-user-data.use-case.ts'), 'utf8');
  const apiServer = readFileSync(resolve(repoRoot, 'apps/api/src/server.ts'), 'utf8');
  const desktopMain = readFileSync(resolve(repoRoot, 'apps/desktop/src/main/main.ts'), 'utf8');

  it('removes Editor from the V2 public payload and export selector', () => {
    expect(portableUserData).not.toContain('PortableEditorDataSchema');
    expect(portableUserData).not.toMatch(/\beditor\s*:/);
    expect(exportableModules).not.toContain("'editor'");
  });

  it('has no V2 Editor export or import dispatch path', () => {
    expect(exportUseCase).not.toContain("modules.includes('editor')");
    expect(exportUseCase).not.toContain('projectEditorWorkspaces');
    expect(importUseCase).not.toContain('importEditor');
    expect(importUseCase).not.toMatch(/data\.editor/);
  });

  it('does not register an Editor capability in either V3 production host', () => {
    const portabilityBlock = (source: string): string => {
      const start = source.indexOf('portableCapabilities: [');
      expect(start).toBeGreaterThanOrEqual(0);
      return source.slice(start, source.indexOf('],', start) + 2);
    };
    expect(portabilityBlock(apiServer)).not.toMatch(/editor/i);
    expect(portabilityBlock(desktopMain)).not.toMatch(/editor/i);
  });

  it('keeps both Editor runtime and legacy persistence deleted after EDITOR-1702', () => {
    expect(existsSync(resolve(repoRoot, 'packages/database/prisma/schema/editor.prisma'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'packages/editor'))).toBe(false);
  });
});
