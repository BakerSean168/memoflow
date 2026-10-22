import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDesktopBuildGlobalSetup } from '../../e2e/helpers/desktop-build-global-setup';

/**
 * Residual 1041: web e2e desktop-build globalSetup duals retired onto e2e/helpers sole.
 * Soft residual: shell global-setup keeps SHELL_E2E_SKIP_BUILD gate (keep-boundary).
 * Soft residual 1042: tip focused suite numbers track Residual 1042 evidence tip (311/1347).
 * Does not flip §13.2 checkboxes.
 */
describe('desktop-build globalSetup dual retired (residual 1041)', () => {
  const root = resolve(__dirname, '../..');
  const sole = readFileSync(resolve(root, 'e2e/helpers/desktop-build-global-setup.ts'), 'utf8');
  const syncConfig = readFileSync(resolve(root, 'playwright.sync.config.ts'), 'utf8');
  const screenshotConfig = readFileSync(
    resolve(root, 'playwright.sync.config.ts'),
    'utf8',
  );
  const shellSetup = readFileSync(resolve(root, 'e2e/shell/global-setup.ts'), 'utf8');

  it('owns sole desktop-build globalSetup helper body', () => {
    expect(sole).toContain('Residual 1041');
    expect(sole).toMatch(/export async function runDesktopBuildGlobalSetup\b/);
    expect(sole).toContain('buildDesktopApp(workspaceRoot)');
    expect(sole).toContain("from './build-desktop'");
  });

  it('sync and desktop-screenshot configs point at sole without local dual files', () => {
    expect(syncConfig).toContain('Residual 1041');
    expect(syncConfig).toContain("./e2e/helpers/desktop-build-global-setup.ts");
    expect(syncConfig).not.toContain("./e2e/sync/global-setup.ts");
    expect(existsSync(resolve(root, 'e2e/sync/global-setup.ts'))).toBe(false);

    expect(screenshotConfig).toContain('Residual 1041');
    expect(screenshotConfig).toContain("./e2e/helpers/desktop-build-global-setup.ts");
    expect(screenshotConfig).not.toContain("./e2e/desktop-screenshots/global-setup.ts");
    expect(existsSync(resolve(root, 'e2e/desktop-screenshots/global-setup.ts'))).toBe(false);
  });

  it('shell keep-boundary reuses sole without local buildDesktopApp dual body', () => {
    expect(shellSetup).toContain('Residual 1041');
    expect(shellSetup).toContain('SHELL_E2E_SKIP_BUILD');
    expect(shellSetup).toContain("from '../helpers/desktop-build-global-setup'");
    expect(shellSetup).toContain('runDesktopBuildGlobalSetup');
    expect(shellSetup).not.toContain("from '../helpers/build-desktop'");
    expect(shellSetup).not.toContain('buildDesktopApp(');
  });

  it('exports callable default/named setup without invoking desktop build', () => {
    expect(typeof runDesktopBuildGlobalSetup).toBe('function');
    expect(runDesktopBuildGlobalSetup.length).toBe(0);
  });
});
