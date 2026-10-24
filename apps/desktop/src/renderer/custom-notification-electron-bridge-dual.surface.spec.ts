import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 911: CustomNotificationView local ElectronBridge dual retired.
 * Residual 941: local getElectronBridge dual retired — sole host helper in platform/electron-bridge.
 * Uses @memoflow/ipc-client ElectronBridge sole body (same as residual 270 window typing).
 * Residual 270 (soft): window.electronAPI typed as ElectronBridge
 *   (desktop-electron-bridge-window.surface.spec.ts).
 * Residual 909 (soft): app-vue Window uses DesktopAuthApi invoke-only keep-boundary
 *   (packages/app-vue .../electron-window-desktop-api-dual.surface.spec.ts).
 * Does not flip §13.2 checkboxes.
 */
describe('custom notification ElectronBridge dual retired (residual 911/941)', () => {
  const rendererDir = __dirname;
  const view = readFileSync(resolve(rendererDir, 'CustomNotificationView.vue'), 'utf8');
  const ipcTypes = readFileSync(
    resolve(rendererDir, '../../../../packages/ipc-client/src/types.ts'),
    'utf8',
  );
  const env = readFileSync(resolve(rendererDir, 'env.d.ts'), 'utf8');
  const hostBridge = readFileSync(resolve(rendererDir, 'platform/electron-bridge.ts'), 'utf8');

  it('imports getElectronBridge from host sole helper and drops local duals', () => {
    expect(view).toContain('Residual 911');
    expect(view).toContain('Residual 941');
    expect(view).toContain("import { getElectronBridge } from './platform/electron-bridge'");
    expect(view).not.toMatch(/function getElectronBridge\b/);
    expect(view).not.toMatch(/interface ElectronBridge\s*\{/);
    expect(view).not.toMatch(/type ElectronBridge\s*=\s*\{/);
    expect(view).not.toContain('window.electronAPI');
  });

  it('keeps sole ElectronBridge object body in ipc-client types', () => {
    expect(ipcTypes).toMatch(/export interface ElectronBridge\s*\{/);
    expect(ipcTypes).toContain('invoke(channel: string, ...args: unknown[]): Promise<unknown>');
    expect(ipcTypes).toContain('on(channel: string, callback: (...args: unknown[]) => void): void');
    expect(ipcTypes).toContain(
      'off(channel: string, callback: (...args: unknown[]) => void): void',
    );
  });

  it('still consumes invoke/on/off notification channels via getElectronBridge', () => {
    expect(env).toContain('electronAPI?: ElectronBridge');
    expect(view).toContain('NotificationChannels.CUSTOM_RECEIVE');
    expect(view).toContain('const bridge = getElectronBridge()');
    expect(view).toContain('bridge.on(');
    expect(view).toContain('bridge.off(');
    expect(view).toContain('bridge.invoke(');
    expect(hostBridge).toContain('Residual 941');
    expect(hostBridge).toMatch(/export function getElectronBridge\b/);
  });
});
