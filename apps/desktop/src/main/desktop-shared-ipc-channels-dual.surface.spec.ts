import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RepositoryChannels } from '@memoflow/contracts/electron';
import { SUPPORTED_REPOSITORY_CHANNELS } from '../preload/allowed-channels';

/**
 * Residual 256: desktop shared/types ipc-channels dual re-export barrel is gone.
 * Callers import channels from @memoflow/contracts/electron.
 */
describe('desktop shared ipc-channels dual single-track surface', () => {
  const desktopSrc = resolve(__dirname, '..');
  const dualFile = resolve(desktopSrc, 'shared/types/ipc-channels.ts');
  const dualTypesIndex = resolve(desktopSrc, 'shared/types/index.ts');
  const dualSharedIndex = resolve(desktopSrc, 'shared/index.ts');
  const preload = resolve(desktopSrc, 'preload/allowed-channels.ts');
  const repositoryIpcAdapter = resolve(
    desktopSrc,
    '../../../packages/repository/src/infrastructure-client/adapters/ipc/repository-ipc.adapter.ts',
  );
  const notificationView = resolve(desktopSrc, 'renderer/CustomNotificationView.vue');

  it('drops shared/types ipc-channels dual re-export barrel', () => {
    expect(existsSync(dualFile)).toBe(false);
    expect(existsSync(dualTypesIndex)).toBe(false);
    expect(existsSync(dualSharedIndex)).toBe(false);
  });

  it('allows every repository channel invoked by the renderer IPC adapter', () => {
    const adapterSource = readFileSync(repositoryIpcAdapter, 'utf8');
    const channelKeys = Array.from(
      adapterSource.matchAll(/RepositoryChannels\.([A-Z0-9_]+)/gu),
      (match) => match[1],
    );
    const invokedChannels = new Set(
      channelKeys.map((key) => RepositoryChannels[key as keyof typeof RepositoryChannels]),
    );
    const supportedChannels = new Set<string>(SUPPORTED_REPOSITORY_CHANNELS);

    expect(invokedChannels.size).toBeGreaterThan(0);
    for (const channel of invokedChannels) {
      expect(
        supportedChannels.has(channel),
        `preload must allow renderer repository IPC ${channel}`,
      ).toBe(true);
    }
  });

  it('preload and notification view import channels from contracts', () => {
    const preloadSrc = readFileSync(preload, 'utf8');
    const viewSrc = readFileSync(notificationView, 'utf8');
    expect(preloadSrc).toContain("from '@memoflow/contracts/electron'");
    expect(preloadSrc).not.toContain('shared/types/ipc-channels');
    expect(viewSrc).toContain("from '@memoflow/contracts/electron'");
    expect(viewSrc).not.toContain('shared/types/ipc-channels');
  });
});
