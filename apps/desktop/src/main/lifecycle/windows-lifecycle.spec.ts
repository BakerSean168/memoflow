import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, dialog, BrowserWindow } from 'electron';
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
  const window = {};
  const manager = {
    setRuntimeManager: vi.fn(),
    configureCloseBehavior: vi.fn(),
    setStartupHidden: vi.fn(),
    transitionToMainWindow: vi.fn(async () => {}),
    createProfileAccessWindow: vi.fn(),
    getActiveWindow: vi.fn(() => null),
    getMainWindow: vi.fn(() => window),
    getProfileAccessWindow: vi.fn(),
    setDesktopFeaturesRuntime: vi.fn(),
    focusActiveWindow: vi.fn(() => true),
  };
  const runtime = {
    profileRuntimeManager: {
      getStartupProfile: vi.fn(async () => ({ profileId: 'a' })),
      hasPin: vi.fn(async () => false),
      activateStartupProfile: vi.fn(async () => ({
        descriptor: { profileId: 'a' },
        profileResolver: { mainWindowStatePath: '/unused' },
      })),
      getActiveProfileResolver: vi.fn(),
      deactivateProfile: vi.fn(async () => {}),
    },
    setDesktopFeaturesRuntime: vi.fn(),
    setNotification: vi.fn(),
  };
  let originalArgv: string[];
  beforeEach(() => {
    vi.clearAllMocks();
    state.tray = {};
    manager.focusActiveWindow.mockReturnValue(true);
    runtime.profileRuntimeManager.hasPin.mockResolvedValue(false);
    state.configDir = mkdtempSync(path.join(tmpdir(), 'mf-windows-lifecycle-'));
    state.initFeatures.mockImplementation(async () => ({ tray: state.tray, notification: {} }));
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
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

  it('shows a visible warning and window when tray capability is degraded', async () => {
    state.tray = null;
    await register();
    expect(manager.focusActiveWindow).toHaveBeenCalled();
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      window,
      expect.objectContaining({ type: 'warning' }),
    );
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
  it('recreates a destroyed window through the PIN gate even when a notification window survives', async () => {
    await register();
    new BrowserWindow({});
    manager.focusActiveWindow.mockReturnValue(false);
    runtime.profileRuntimeManager.hasPin.mockResolvedValue(true);
    app.emit('activate');
    app.emit('activate');
    await vi.waitFor(() => expect(manager.createProfileAccessWindow).toHaveBeenCalledTimes(1));
    expect(runtime.profileRuntimeManager.activateStartupProfile).toHaveBeenCalledTimes(1);
    expect(runtime.profileRuntimeManager.deactivateProfile).toHaveBeenCalledWith({
      preserveSelection: true,
    });
  });

  it('last-window destruction quits instead of retaining a headless process', async () => {
    await register();
    app.emit('window-all-closed');
    expect(app.quit).toHaveBeenCalled();
  });
});
