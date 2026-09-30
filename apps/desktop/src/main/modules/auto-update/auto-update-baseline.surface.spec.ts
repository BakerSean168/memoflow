import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DU-1001 phase-0 characterization.
 *
 * These assertions intentionally describe the pre-refactor updater boundary so
 * DU-1101+ can migrate it deliberately instead of accidentally preserving a
 * half-wired implementation. Replace this file with target architecture tests
 * as the corresponding migration tickets land.
 */
describe('desktop auto-update phase-0 baseline', () => {
  const manager = readFileSync(resolve(__dirname, 'auto-update-manager.ts'), 'utf8');
  const main = readFileSync(resolve(__dirname, '../../main.ts'), 'utf8');
  const preload = readFileSync(resolve(__dirname, '../../../preload/allowed-channels.ts'), 'utf8');

  it('records that the legacy updater is not composed into the shell runtime yet', () => {
    expect(main).not.toContain("from './modules/auto-update'");
    expect(main).not.toContain('createAutoUpdateManager(');
    expect(main).not.toContain('registerAutoUpdateIpcHandlers(');
  });

  it('records that legacy update IPC is not renderer-reachable through the preload allow-list', () => {
    expect(preload).not.toContain('AutoUpdateChannels');
    expect(preload).not.toMatch(/\.\.\.Object\.values\(AutoUpdateChannels\)/u);
  });

  it('records the ad-hoc native-event projection that DU-1101+ must retire', () => {
    for (const event of [
      'update:checking',
      'update:available',
      'update:not-available',
      'update:progress',
      'update:downloaded',
      'update:error',
    ]) {
      expect(manager).toContain(event);
    }

    expect(manager).toContain('notifyRenderer(channel: string');
  });

  it('records the mutable renderer-facing updater policy surface that must be retired', () => {
    expect(manager).toContain('updateServerUrl?: string');
    expect(manager).toContain('updateConfig(config: Partial<UpdateConfig>)');
    expect(manager).toContain('autoInstallOnAppQuit = this.config.autoInstall');
  });
});
