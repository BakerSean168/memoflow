/**
 * Tray characterization tests.
 *
 * Locks the current TrayManager behavior so the ownership migration of the Tray
 * platform capability can proceed without silently changing behavior. Tests
 * assert what the implementation does today for the Electron test stub.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Tray, Menu, app, BrowserWindow } from 'electron';
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
    expect(tray!.setToolTip).toHaveBeenCalledWith(APP_DISPLAY_NAME);
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
      'Show App',
      'Settings',
      'separator',
      'Quit',
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

  it('hides the main window when the tray is clicked while visible', () => {
    const manager = new TrayManager(window);
    window.show();
    expect(window.isVisible()).toBe(true);
    const tray = Tray.lastInstance() as Tray | null;
    tray!.emit('click');
    expect(window.isVisible()).toBe(false);
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
    expect(window.webContents.send).toHaveBeenCalledWith('navigate', '/settings');
    manager.destroy();
  });

  it('Quit menu entry triggers app.quit', () => {
    const manager = new TrayManager(window);
    vi.mocked(app.quit).mockClear();
    const template = vi.mocked(Menu.buildFromTemplate).mock.calls[0]?.[0] as Array<{
      label?: string;
      click?: () => void;
    }>;
    const quit = template.find((entry) => entry.label === 'Quit');
    expect(quit).toBeDefined();
    quit!.click!();
    expect(app.quit).toHaveBeenCalled();
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
