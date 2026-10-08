/**
 * Global Shortcut characterization tests.
 *
 * Locks the current ShortcutManager (Electron `globalShortcut`) behavior so the
 * capability ownership migration cannot change it silently.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserWindow, globalShortcut } from 'electron';
import { ShortcutManager } from './shortcut-manager';

describe('ShortcutManager', () => {
  let window: BrowserWindow;

  beforeEach(() => {
    vi.clearAllMocks();
    window = new BrowserWindow({});
    window.hide();
  });

  it('registers the default show-app global shortcut on construction', () => {
    const manager = new ShortcutManager(window);
    const configs = manager.getShortcuts();
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({
      id: 'show-app',
      accelerator: 'CommandOrControl+Shift+D',
      description: 'Show/Hide Application',
      global: true,
      enabled: true,
    });
    expect(globalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+Shift+D',
      expect.any(Function),
    );
  });

  it('show-app action shows the hidden window', () => {
    new ShortcutManager(window);
    window.hide();
    expect(window.isVisible()).toBe(false);
    const action = vi
      .mocked(globalShortcut.register)
      .mock.calls.find(([acc]) => acc === 'CommandOrControl+Shift+D')?.[1] as () => void;
    action();
    expect(window.isVisible()).toBe(true);
  });

  it('show-app action hides the visible window', () => {
    new ShortcutManager(window);
    window.show();
    expect(window.isVisible()).toBe(true);
    const action = vi
      .mocked(globalShortcut.register)
      .mock.calls.find(([acc]) => acc === 'CommandOrControl+Shift+D')?.[1] as () => void;
    action();
    expect(window.isVisible()).toBe(false);
  });

  it('rejects a duplicate accelerator registration', () => {
    const manager = new ShortcutManager(window);
    const result = manager.register({
      id: 'show-app',
      accelerator: 'CommandOrControl+Shift+D',
      description: 'dup',
      global: true,
      enabled: true,
      action: () => {},
    });
    expect(result).toBe(false);
    expect(manager.getShortcuts()).toHaveLength(1);
  });

  it('registers a user shortcut and reports success', () => {
    const manager = new ShortcutManager(window);
    const result = manager.register({
      id: 'custom',
      accelerator: 'CommandOrControl+Alt+E',
      description: 'custom shortcut',
      global: true,
      enabled: true,
      action: () => {},
    });
    expect(result).toBe(true);
    expect(globalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+Alt+E',
      expect.any(Function),
    );
  });

  it('returns false when the OS rejects a global shortcut registration', () => {
    const manager = new ShortcutManager(window);
    vi.mocked(globalShortcut.register).mockReturnValueOnce(false);
    const result = manager.register({
      id: 'custom',
      accelerator: 'CommandOrControl+Alt+K',
      description: 'custom shortcut',
      global: true,
      enabled: true,
      action: () => {},
    });
    expect(result).toBe(false);
    expect(manager.getShortcuts().some((c) => c.id === 'custom')).toBe(false);
    expect(
      manager.register({
        id: 'retry',
        accelerator: 'CommandOrControl+Alt+K',
        description: 'retry',
        global: true,
        enabled: true,
        action: () => {},
      }),
    ).toBe(true);
  });

  it('unregisters a global shortcut and removes it from the registry', () => {
    const manager = new ShortcutManager(window);
    manager.unregister('CommandOrControl+Shift+D');
    expect(globalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+Shift+D');
    expect(manager.getShortcuts()).toHaveLength(0);
  });

  it('unregisterAll clears the registry and calls globalShortcut.unregisterAll', () => {
    const manager = new ShortcutManager(window);
    manager.unregisterAll();
    expect(globalShortcut.unregisterAll).toHaveBeenCalled();
    expect(manager.getShortcuts()).toHaveLength(0);
  });
});
