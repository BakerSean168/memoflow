/**
 * Tray characterization tests.
 *
 * Locks the current TrayManager behavior so the ownership migration of the Tray
 * platform capability can proceed without silently changing behavior. Tests
 * assert what the implementation does today for the Electron test stub.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Tray, Menu, app, BrowserWindow } from 'electron';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DesktopLifecyclePreference } from '../../lifecycle/desktop-lifecycle-preference';
import { RendererEventChannels } from '@memoflow/desktop-contracts';
import { APP_DISPLAY_NAME } from '@memoflow/assets';

// The tray icon resolver depends on packaged asset paths that are not present
// in a headless test environment; stub it so we exercise TrayManager's own
// integration with Electron Tray/Menu rather than asset resolution.
vi.mock('../../utils/app-icon', () => ({
  resolveTrayIcon: vi.fn(() => ({ image: 'test-tray-icon' })),
}));

import { TrayManager } from './tray-manager';

type TrayLike = Tray & {
  setToolTip: ReturnType<typeof vi.fn>;
  setContextMenu: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

function createWindow(): BrowserWindow {
  return new BrowserWindow({});
}

describe('TrayManager', () => {
  let window: BrowserWindow;

  beforeEach(() => {
    vi.clearAllMocks();
    Tray.clearInstances();
    window = createWindow();
    window.hide();
    expect(window.isVisible()).toBe(false);
  });

  it('creates a tray icon and sets the product tooltip on construction', () => {
    const manager = new TrayManager(window);
    const tray = Tray.lastInstance() as TrayLike | null;
    expect(tray).not.toBeNull();
    expect(tray!.setToolTip).toHaveBeenCalledWith(`${APP_DISPLAY_NAME} — Running in background`);
    expect(tray!.setContextMenu).toHaveBeenCalled();
    manager.destroy();
  });

  it('builds a context menu with Show App, Settings, separator, and Quit entries', () => {
    const manager = new TrayManager(window);
    const template = vi.mocked(Menu.buildFromTemplate).mock.calls[0]?.[0] as Array<{
      label?: string;
      type?: string;
    }>;
    expect(template).toBeDefined();
    expect(template.map((entry) => entry.label ?? entry.type)).toEqual([
      'Open MemoFlow',
      'Settings',
      'separator',
      'Quit MemoFlow',
    ]);
    manager.destroy();
  });

  it('shows the main window when the tray is clicked while hidden', () => {
    const manager = new TrayManager(window);
    const tray = Tray.lastInstance() as Tray | null;
    expect(tray).not.toBeNull();
    tray!.emit('click');
    expect(window.isVisible()).toBe(true);
    manager.destroy();
  });

  it('keeps the main window visible on repeated tray clicks', () => {
    const manager = new TrayManager(window);
    window.show();
    expect(window.isVisible()).toBe(true);
    const tray = Tray.lastInstance() as Tray | null;
    tray!.emit('click');
    expect(window.isVisible()).toBe(true);
    manager.destroy();
  });

  it('Settings entry shows the window and navigates to /settings', () => {
    const manager = new TrayManager(window);
    window.hide();
    const template = vi.mocked(Menu.buildFromTemplate).mock.calls[0]?.[0] as Array<{
      label?: string;
      click?: () => void;
    }>;
    const settings = template.find((entry) => entry.label === 'Settings');
    expect(settings).toBeDefined();
    settings!.click!();
    expect(window.isVisible()).toBe(true);
    expect(window.webContents.send).toHaveBeenCalledWith(
      RendererEventChannels.TRAY_ACTION,
      'settings',
    );
    manager.destroy();
  });

  it('Quit menu entry triggers app.quit', () => {
    const manager = new TrayManager(window);
    vi.mocked(app.quit).mockClear();
    const template = vi.mocked(Menu.buildFromTemplate).mock.calls[0]?.[0] as Array<{
      label?: string;
      click?: () => void;
    }>;
    const quit = template.find((entry) => entry.label === 'Quit MemoFlow');
    expect(quit).toBeDefined();
    quit!.click!();
    expect(app.quit).toHaveBeenCalled();
    manager.destroy();
  });

  it('restores minimized windows on double click', () => {
    const manager = new TrayManager(window);
    window.minimize();
    Tray.lastInstance()!.emit('double-click');
    expect(window.isMinimized()).toBe(false);
    expect(window.isVisible()).toBe(true);
    manager.destroy();
  });

  it('uses the live Profile gate and does not navigate a locked renderer', () => {
    const restore = vi.fn();
    const manager = new TrayManager(window, { restore, canNavigate: () => false });
    const template = vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)![0];
    (template[1].click as () => void)();
    expect(restore).toHaveBeenCalled();
    expect(window.webContents.send).not.toHaveBeenCalled();
    manager.destroy();
  });

  it('persists close/startup choices from the tray settings submenu', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mf-tray-'));
    const file = path.join(root, 'preferences.json');
    const manager = new TrayManager(window, { preference: new DesktopLifecyclePreference(file) });
    try {
      const template = vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)![0];
      const submenu = template[2].submenu as Electron.MenuItemConstructorOptions[];
      (submenu[0].click as (item: { checked: boolean }) => void)({ checked: false });
      (submenu[1].click as (item: { checked: boolean }) => void)({ checked: false });
      expect(new DesktopLifecyclePreference(file)).toMatchObject({
        closeToTray: false,
        startHidden: false,
      });
      expect(app.setLoginItemSettings).not.toHaveBeenCalled();
    } finally {
      manager.destroy();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('propagates tray construction failure for capability degradation and releases the partial icon', () => {
    vi.mocked(Menu.buildFromTemplate).mockImplementationOnce(() => {
      throw new Error('tray unavailable');
    });
    expect(() => new TrayManager(window)).toThrow('tray unavailable');
    expect(Tray.lastInstance()!.destroy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('localizes the tray menu in Chinese', () => {
    vi.mocked(app.getLocale).mockReturnValue('zh-CN');
    const manager = new TrayManager(window);
    const template = vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)![0];
    expect(template.map((item) => item.label ?? item.type)).toEqual([
      '打开 MemoFlow',
      '设置',
      'separator',
      '退出 MemoFlow',
    ]);
    vi.mocked(app.getLocale).mockReturnValue('en-US');
    manager.destroy();
  });

  it('destroy tears down the tray and stops flashing', () => {
    const manager = new TrayManager(window);
    manager.startFlashing();
    manager.destroy();
    const tray = Tray.lastInstance() as TrayLike | null;
    expect(tray!.destroy).toHaveBeenCalled();
  });

  it('startFlashing is a safe no-op after the tray has been destroyed', () => {
    const manager = new TrayManager(window);
    manager.destroy();
    expect(() => manager.startFlashing()).not.toThrow();
  });
});
