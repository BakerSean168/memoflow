import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WindowManager } from './window-manager';
import { DesktopLifecyclePreference } from './desktop-lifecycle-preference';
import type { DesktopFeaturesRuntime } from '../desktop-features';
import type { DesktopProfileRuntimeManager } from '../profile';
import { DesktopShutdownCoordinator } from './desktop-shutdown-coordinator';
import { createBeforeQuitHandler } from './before-quit-handler';

vi.mock('../utils/app-icon', () => ({ resolveWindowIconPath: () => 'test-icon' }));
vi.mock('../utils/resolve-preload-path', () => ({
  resolvePreloadPath: () => 'preload.cjs',
  hasResolvedPreload: () => true,
}));
vi.mock('../runtime-init', () => ({
  getSharedPathResolver: () => ({ profileAccessWindowStatePath: '/unused' }),
}));
vi.mock('../modules/window', () => ({
  WindowStateManager: class {
    width = 1200;
    height = 800;
    manage() {}
    unmanage() {}
  },
}));

describe('Windows main-window close lifecycle', () => {
  let manager: WindowManager;
  let preference: DesktopLifecyclePreference;
  let root: string;
  const start = vi.fn(async () => {});
  const stop = vi.fn(async () => {});
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    root = mkdtempSync(path.join(tmpdir(), 'mf-close-'));
    preference = new DesktopLifecyclePreference(path.join(root, 'lifecycle.json'));
    manager = new WindowManager({ isDev: false });
    manager.configureCloseBehavior(preference, () => false);
    manager.setRuntimeManager({
      getActiveProfileId: () => 'profile-a',
    } as DesktopProfileRuntimeManager);
    manager.setScheduleRuntimeController({ start, stop });
    manager.setDesktopFeaturesRuntime({
      tray: {},
      bindWindow: vi.fn(),
    } as unknown as DesktopFeaturesRuntime);
  });
  afterEach(() => {
    manager.cleanup();
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });
  async function open() {
    const transition = manager.transitionToMainWindow('profile-a', path.join(root, 'window.json'));
    manager.getMainWindow()!.emit('ready-to-show');
    await transition;
    return manager.getMainWindow()!;
  }

  it('close hides the same renderer without stopping the Profile scheduler; restore preserves it', async () => {
    const main = await open();
    const send = main.webContents.send;
    main.close();
    expect(main.isDestroyed()).toBe(false);
    expect(main.isVisible()).toBe(false);
    expect(manager.getMainWindow()).toBe(main);
    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    expect(app.quit).not.toHaveBeenCalled();
    main.minimize();
    expect(manager.focusActiveWindow()).toBe(true);
    expect(main.isVisible()).toBe(true);
    expect(main.isMinimized()).toBe(false);
    expect(main.webContents.send).toBe(send);
  });

  it.each(['disabled', 'unavailable'] as const)(
    '%s tray closes through coordinated app.quit',
    async (mode) => {
      const main = await open();
      if (mode === 'disabled') preference.update('closeToTray', false);
      else manager.setDesktopFeaturesRuntime(null);
      main.close();
      expect(app.quit).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['normal-quit', 'update-install'] as const)(
    'allows terminal close after %s cleanup settles',
    async (reason) => {
      const main = await open();
      const cleanup = vi.fn(async () => {});
      const coordinator = new DesktopShutdownCoordinator({ cleanup });
      manager.configureCloseBehavior(preference, () => coordinator.shouldAllowProcessExit);
      if (reason === 'normal-quit') {
        await createBeforeQuitHandler(coordinator, () => main.close())({
          preventDefault: vi.fn(),
        } as unknown as Electron.Event);
      } else {
        await coordinator.request(reason);
        coordinator.beginTerminalExit(reason);
        main.close();
      }
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(main.isDestroyed()).toBe(true);
    },
  );

  it('lock stops scheduling and destroys the old renderer; restore opens only Profile Access', async () => {
    const main = await open();
    main.close();
    const transition = manager.transitionToProfileAccessWindow();
    await Promise.resolve();
    manager.getProfileAccessWindow()!.emit('ready-to-show');
    await transition;
    expect(stop).toHaveBeenCalledTimes(1);
    expect(main.isDestroyed()).toBe(true);
    expect(manager.canNavigateToMainWindow()).toBe(false);
    manager.getProfileAccessWindow()!.hide();
    expect(manager.focusActiveWindow()).toBe(true);
    expect(manager.getProfileAccessWindow()!.isVisible()).toBe(true);
    expect(manager.getMainWindow()).toBeNull();
  });

  it('does not expose an outgoing renderer while profile teardown awaits', async () => {
    const main = await open();
    let finish!: () => void;
    stop.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const transition = manager.transitionToProfileAccessWindow();
    expect(manager.focusActiveWindow()).toBe(false);
    expect(manager.focusMainWindow()).toBe(false);
    expect(main.isVisible()).toBe(false);
    finish();
    await Promise.resolve();
    manager.getProfileAccessWindow()!.emit('ready-to-show');
    await transition;
  });

  it('hidden startup still starts scheduling without showing the main window', async () => {
    manager.setStartupHidden(true);
    const main = await open();
    expect(start).toHaveBeenCalledTimes(1);
    expect(main.isVisible()).toBe(false);
  });

  it('a late ready event cannot expose a hidden PIN gate after startup finishes', () => {
    manager.setStartupHidden(true);
    const gate = manager.createProfileAccessWindow();
    manager.setStartupHidden(false);
    gate.emit('ready-to-show');
    expect(gate.isVisible()).toBe(false);
    expect(manager.focusActiveWindow()).toBe(true);
  });

  it('OS session termination requests coordinated quit', async () => {
    const main = await open();
    const event = { preventDefault: vi.fn() };
    main.emit('query-session-end', event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(app.quit).toHaveBeenCalled();
  });
});
