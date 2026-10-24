import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 941: host ElectronBridge access duals retired.
 * Sole helpers live in platform/electron-bridge.ts
 * (getElectronBridge / requireElectronBridge / ensureElectronBridgeAvailable).
 * Soft residual 911: CustomNotificationView local ElectronBridge dual retired.
 * Soft residual 929: app-vue window-controls ElectronBridge keep-boundary.
 * Soft residual 909: app-vue DesktopAuthApi invoke-only keep-boundary.
 * Residual 943 (soft): escapeHtml dual retired
 *   (packages/utils/src/shared/escape-html-dual.surface.spec.ts).
 * Does not flip §13.2 checkboxes.
 */
describe('host ElectronBridge helper duals retired (residual 941)', () => {
  const rendererDir = __dirname;
  const bridge = readFileSync(resolve(rendererDir, 'platform/electron-bridge.ts'), 'utf8');
  const diApp = readFileSync(resolve(rendererDir, 'platform/di-app.ts'), 'utf8');
  const diAuth = readFileSync(resolve(rendererDir, 'platform/di-auth.ts'), 'utf8');
  const electron = readFileSync(resolve(rendererDir, 'platform/electron.ts'), 'utf8');
  const bootstrap = readFileSync(resolve(rendererDir, 'bootstrap/app.ts'), 'utf8');
  const main = readFileSync(resolve(rendererDir, 'main.ts'), 'utf8');
  const view = readFileSync(resolve(rendererDir, 'CustomNotificationView.vue'), 'utf8');

  it('owns sole host bridge helpers in platform/electron-bridge', () => {
    expect(bridge).toContain('Residual 941');
    expect(bridge).toMatch(/export function getElectronBridge\b/);
    expect(bridge).toMatch(/export function requireElectronBridge\b/);
    expect(bridge).toMatch(/export function ensureElectronBridgeAvailable\b/);
    expect(bridge).toContain('return window.electronAPI');
  });

  it('platform DI/bootstrap/main consume sole helpers without direct window.electronAPI duals', () => {
    expect(diApp).toContain('Residual 941');
    expect(diApp).toContain("from './electron-bridge'");
    expect(diApp).toContain("requireElectronBridge('installDesktopAppServices')");
    expect(diApp).not.toContain('window.electronAPI');

    expect(diAuth).toContain('Residual 941');
    expect(diAuth).toContain("requireElectronBridge('installDesktopAuthServices')");
    expect(diAuth).not.toContain('window.electronAPI');

    expect(electron).toContain('Residual 941');
    expect(electron).toContain('getElectronBridge()');
    expect(electron).not.toContain('window.electronAPI');

    expect(bootstrap).toContain('Residual 941');
    expect(bootstrap).toContain("requireElectronBridge('bootstrapMainApp')");
    expect(bootstrap).toContain('readDesktopAccessSnapshot(bridge)');
    expect(bootstrap).not.toContain('window.electronAPI');

    expect(main).toContain('Residual 941');
    expect(main).toContain("from './platform/electron-bridge'");
    expect(main).toContain('ensureElectronBridgeAvailable()');
    expect(main).not.toMatch(/function ensureElectronBridgeAvailable\b/);
    expect(main).not.toContain('window.electronAPI');
  });

  it('CustomNotificationView imports host getElectronBridge sole helper', () => {
    expect(view).toContain('Residual 941');
    expect(view).toContain(
      "import { getElectronBridge } from './platform/electron-bridge'",
    );
    expect(view).not.toMatch(/function getElectronBridge\b/);
    expect(view).not.toContain('window.electronAPI');
  });
});
