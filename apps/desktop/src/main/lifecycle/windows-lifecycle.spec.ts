import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, dialog, ipcMain, BrowserWindow } from 'electron';
import {
  RendererEventChannels,
  SystemChannels,
  type SystemNotice,
} from '@memoflow/desktop-contracts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerAppLifecycleHandlers } from './app-lifecycle';
import { DesktopLifecyclePreference } from './desktop-lifecycle-preference';
import { DesktopShutdownCoordinator } from './desktop-shutdown-coordinator';
import type { DesktopMainRuntime } from '../desktop-main-runtime';
import type { WindowManager } from './window-manager';

const state = vi.hoisted(() => ({
  configDir: '',
  tray: {} as object | null,
  initFeatures: vi.fn(),
}));
vi.mock('../runtime-init', () => ({
  getSharedPathResolver: () => ({ configDir: state.configDir }),
}));
vi.mock('../desktop-features', () => ({ initializeDesktopFeatures: state.initFeatures }));
vi.mock('../ipc/keyboard-handlers', () => ({ registerKeyboardHandlers: vi.fn() }));
vi.mock('../ipc/system-handlers', () => ({ registerSystemIpcHandlers: vi.fn() }));
vi.mock('../modules/desktop-update/runtime/desktop-update-e2e-harness', () => ({
  resolveDesktopUpdateE2EConfig: () => null,
}));

describe('Windows shell lifecycle', () => {
  const window = {
    isDestroyed: () => false,
    webContents: { id: 501, send: vi.fn(), isDestroyed: () => false },
  } as unknown as BrowserWindow;
  const manager = {
    setRuntimeManager: vi.fn(),
    configureCloseBehavior: vi.fn(),
    setStartupHidden: vi.fn(),
    transitionToMainWindow: vi.fn(async () => {}),
    createProfileAccessWindow: vi.fn(() => window),
    getActiveWindow: vi.fn(() => null),
    getMainWindow: vi.fn(() => window),
    getProfileAccessWindow: vi.fn(),
    setDesktopFeaturesRuntime: vi.fn(),
    focusActiveWindow: vi.fn(() => true),
  };
  const runtime = {
    profileRuntimeManager: {
      getStartupProfile: vi.fn(async () => ({ profileId: 'a', profileKind: 'registered' })),
      getActiveProfileResolver: vi.fn(),
      deactivateProfile: vi.fn(async () => {}),
    },
    setDesktopFeaturesRuntime: vi.fn(),
    setNotification: vi.fn(),
  };
  let originalArgv: string[];
  let platformSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    state.tray = {};
    manager.focusActiveWindow.mockReturnValue(true);
    runtime.profileRuntimeManager.getStartupProfile.mockResolvedValue({
      profileId: 'a',
      profileKind: 'registered',
    });
    state.configDir = mkdtempSync(path.join(tmpdir(), 'mf-windows-lifecycle-'));
    state.initFeatures.mockImplementation(async () => ({ tray: state.tray, notification: {} }));
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    originalArgv = process.argv;
    process.argv = ['MemoFlow.exe', '--hidden'];
    Object.defineProperty(app, 'isPackaged', { configurable: true, value: true });
  });
  afterEach(() => {
    for (const event of [
      'second-instance',
      'activate',
      'before-quit',
      'window-all-closed',
      'web-contents-created',
    ])
      app.removeAllListeners(event);
    rmSync(state.configDir, { recursive: true, force: true });
    for (const win of BrowserWindow.getAllWindows()) win.destroy();
    process.argv = originalArgv;
    Object.defineProperty(app, 'isPackaged', { configurable: true, value: false });
    vi.restoreAllMocks();
  });
  async function register(initialize = async () => {}) {
    registerAppLifecycleHandlers(
      initialize,
      () => runtime as unknown as DesktopMainRuntime,
      manager as unknown as WindowManager,
      new DesktopShutdownCoordinator({ cleanup: async () => {} }),
    );
    await vi.waitFor(() => expect(runtime.setNotification).toHaveBeenCalled());
    await Promise.resolve();
  }
  it('keeps an explicitly hidden startup in tray and never enables auto-launch', async () => {
    await register();
    expect(manager.setStartupHidden).toHaveBeenNthCalledWith(1, true);
    expect(manager.focusActiveWindow).not.toHaveBeenCalled();
    expect(app.setLoginItemSettings).not.toHaveBeenCalled();
  });
  it.each(['manual launch', 'start-hidden opt-out'])(
    'shows the window for %s without changing auto-launch authorization',
    async (mode) => {
      if (mode === 'manual launch') process.argv = ['MemoFlow.exe'];
      else
        new DesktopLifecyclePreference(path.join(state.configDir, 'desktop-lifecycle.json')).update(
          'startHidden',
          false,
        );
      await register();
      expect(manager.setStartupHidden).toHaveBeenNthCalledWith(1, false);
      expect(manager.focusActiveWindow).toHaveBeenCalled();
      expect(app.setLoginItemSettings).not.toHaveBeenCalled();
    },
  );

  it('stops the secondary instance before any Profile or desktop worker starts', async () => {
    vi.mocked(app.requestSingleInstanceLock).mockReturnValueOnce(false);
    const initialize = vi.fn(async () => {});
    registerAppLifecycleHandlers(
      initialize,
      () => runtime as unknown as DesktopMainRuntime,
      manager as unknown as WindowManager,
      new DesktopShutdownCoordinator({ cleanup: async () => {} }),
    );
    await Promise.resolve();
    expect(initialize).not.toHaveBeenCalled();
    expect(state.initFeatures).not.toHaveBeenCalled();
    expect(app.exit).toHaveBeenCalledWith(0);
  });

  function systemNoticeHandler() {
    const call = vi
      .mocked(ipcMain.handle)
      .mock.calls.filter(([channel]) => channel === SystemChannels.SYSTEM_NOTICE_READY)
      .at(-1);
    if (!call) throw new Error('system notice ready handler was not registered');
    return call[1] as unknown as (event: { sender: typeof window.webContents }) => unknown;
  }

  async function reportRendererReady(): Promise<void> {
    systemNoticeHandler()({ sender: window.webContents });
    await Promise.resolve();
  }

  it('delivers the tray warning as a queued in-app notice instead of a native dialog', async () => {
    state.tray = null;
    await register();
    expect(manager.focusActiveWindow).toHaveBeenCalled();
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    // The renderer has not reported readiness yet, so nothing may be pushed.
    expect(window.webContents.send).not.toHaveBeenCalledWith(
      RendererEventChannels.SYSTEM_NOTICE,
      expect.anything(),
    );

    await reportRendererReady();
    expect(window.webContents.send).toHaveBeenCalledExactlyOnceWith(
      RendererEventChannels.SYSTEM_NOTICE,
      { id: 'tray-unavailable' } satisfies SystemNotice,
    );
    expect(dialog.showMessageBox).not.toHaveBeenCalled();

    // A repeated readiness signal must not replay the already delivered notice.
    await reportRendererReady();
    expect(window.webContents.send).toHaveBeenCalledTimes(1);
  });

  it('does not publish the tray warning when the tray capability is available', async () => {
    await register();
    expect(window.webContents.send).not.toHaveBeenCalledWith(
      RendererEventChannels.SYSTEM_NOTICE,
      expect.anything(),
    );
    await reportRendererReady();
    expect(window.webContents.send).not.toHaveBeenCalledWith(
      RendererEventChannels.SYSTEM_NOTICE,
      expect.anything(),
    );
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it('does not publish the tray warning outside win32', async () => {
    platformSpy.mockReturnValue('darwin');
    state.tray = null;
    await register();
    await reportRendererReady();
    expect(window.webContents.send).not.toHaveBeenCalledWith(
      RendererEventChannels.SYSTEM_NOTICE,
      expect.anything(),
    );
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
  });
  it('defers a second launch until the Profile gate has initialized', async () => {
    let release!: () => void;
    const ready = register(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    app.emit('second-instance');
    expect(manager.focusActiveWindow).not.toHaveBeenCalled();
    release();
    await ready;
    await vi.waitFor(() => expect(manager.focusActiveWindow).toHaveBeenCalledTimes(1));
  });
  it('recreates a destroyed window through the identity gate and drops the stale runtime', async () => {
    await register();
    new BrowserWindow({});
    manager.focusActiveWindow.mockReturnValue(false);
    runtime.profileRuntimeManager.getStartupProfile.mockResolvedValue({
      profileId: 'a',
      profileKind: 'registered',
    });
    app.emit('activate');
    app.emit('activate');
    await vi.waitFor(() => expect(manager.createProfileAccessWindow).toHaveBeenCalledTimes(1));
    expect(runtime.profileRuntimeManager.deactivateProfile).toHaveBeenCalledWith({
      preserveSelection: true,
    });
    expect(manager.transitionToMainWindow).not.toHaveBeenCalled();
  });

  it('starts on the identity gate even when a registered Profile is the startup candidate', async () => {
    runtime.profileRuntimeManager.getStartupProfile.mockResolvedValue({
      profileId: 'a',
      profileKind: 'registered',
    });
    await register();

    expect(manager.createProfileAccessWindow).toHaveBeenCalledTimes(1);
    expect(manager.transitionToMainWindow).not.toHaveBeenCalled();
    expect(runtime.profileRuntimeManager.getStartupProfile).not.toHaveBeenCalled();
  });

  it('opens the empty account list instead of minting an identity when no Profile exists', async () => {
    runtime.profileRuntimeManager.getStartupProfile.mockResolvedValue(null);
    await register();

    expect(manager.createProfileAccessWindow).toHaveBeenCalledTimes(1);
    expect(manager.transitionToMainWindow).not.toHaveBeenCalled();
  });

  it('last-window destruction quits instead of retaining a headless process', async () => {
    await register();
    app.emit('window-all-closed');
    expect(app.quit).toHaveBeenCalled();
  });
});
