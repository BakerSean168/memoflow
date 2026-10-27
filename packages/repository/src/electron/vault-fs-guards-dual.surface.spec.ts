import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMissing, isTemporaryFile } from './vault-fs-guards';

/**
 * Residual 957: vault FS guard duals retired (isMissing + isTemporaryFile).
 * Sole bodies in vault-fs-guards.ts; local-vault-runtime + desktop auto-sync/git runtime import them.
 * Soft residual 955: app-vue AI getRecordString dual retired
 *   (packages/ai-ui/src/composables/get-record-string-dual.surface.spec.ts).
 * Soft residual 958: tip focused suite numbers track Residual 958 evidence tip (270/1197).
 * Soft residual 959: normalizeEmail dual retired (packages/authentication/src/server/shared/normalize-email-dual.surface.spec.ts).
 * isTemporarySyncFile name retired onto isTemporaryFile sole.
 * Does not flip §13.2 checkboxes.
 */
describe('vault FS guards dual retired (residual 957)', () => {
  const dir = __dirname;
  const sole = readFileSync(resolve(dir, 'vault-fs-guards.ts'), 'utf8');
  const localVault = readFileSync(resolve(dir, 'local-vault-runtime.ts'), 'utf8');
  const index = readFileSync(resolve(dir, 'index.ts'), 'utf8');
  const repoRoot = resolve(dir, '../../../../');
  const autoSync = readFileSync(
    resolve(
      repoRoot,
      'apps/desktop/src/main/modules/repository/desktop-knowledge-repository-auto-sync.scheduler.ts',
    ),
    'utf8',
  );
  const gitRuntime = readFileSync(
    resolve(
      repoRoot,
      'apps/desktop/src/main/modules/repository/desktop-knowledge-repository-git.runtime.ts',
    ),
    'utf8',
  );

  it('owns sole isMissing / isTemporaryFile helper bodies and electron barrel export', () => {
    expect(sole).toContain('Residual 957');
    expect(sole).toMatch(/export function isMissing\b/);
    expect(sole).toMatch(/export function isTemporaryFile\b/);
    expect(sole).toContain("code === 'ENOENT'");
    expect(sole).toContain("name === '.DS_Store'");
    expect(index).toContain('Residual 957');
    expect(index).toContain("export { isMissing, isTemporaryFile } from './vault-fs-guards'");
  });

  it('local-vault + desktop auto-sync/git import sole without local dual bodies', () => {
    expect(localVault).toContain('Residual 957');
    expect(localVault).toContain("import { isMissing, isTemporaryFile } from './vault-fs-guards'");
    expect(localVault).not.toMatch(/function isMissing\b/);
    expect(localVault).not.toMatch(/function isTemporaryFile\b/);
    expect(localVault).not.toMatch(/function isTemporarySyncFile\b/);
    expect(localVault).toContain('isTemporaryFile(entry.name)');
    expect(localVault).toContain('isMissing(error)');

    expect(autoSync).toContain('Residual 957');
    expect(autoSync).toContain(
      "import { isMissing, isTemporaryFile } from '@memoflow/repository/electron'",
    );
    expect(autoSync).not.toMatch(/function isMissing\b/);
    expect(autoSync).not.toMatch(/function isTemporaryFile\b/);
    expect(autoSync).toContain('isTemporaryFile');
    expect(autoSync).toContain('isMissing(error)');

    expect(gitRuntime).toContain('Residual 957');
    expect(gitRuntime).toContain(
      "import { isMissing, isTemporaryFile } from '@memoflow/repository/electron'",
    );
    expect(gitRuntime).not.toMatch(/function isMissing\b/);
    expect(gitRuntime).not.toMatch(/function isTemporaryFile\b/);
    expect(gitRuntime).toContain('isTemporaryFile');
    expect(gitRuntime).toContain('isMissing(error)');
  });

  it('type-guards ENOENT errors and temporary basenames', () => {
    expect(isMissing(null)).toBe(false);
    expect(isMissing({ code: 'ENOENT' })).toBe(true);
    expect(isMissing({ code: 'EACCES' })).toBe(false);
    expect(isTemporaryFile('.DS_Store')).toBe(true);
    expect(isTemporaryFile('note.md')).toBe(false);
    expect(isTemporaryFile('draft.tmp')).toBe(true);
    expect(isTemporaryFile('file~')).toBe(true);
  });
});
