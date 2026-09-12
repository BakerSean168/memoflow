/**
 * Electron-First Capability Factories
 *
 * The Electron-first construction seam for the five desktop platform
 * capabilities. Each factory returns the narrow capability port
 * (`capabilities/ports.ts`) backed by an Electron implementation, or the
 * `UNAVAILABLE` sentinel when the capability cannot be provided on this host.
 *
 * Host-provided values (`BrowserWindow`, window manager, options) are passed in
 * by the caller; the factories never acquire them from module state. The
 * concrete managers stay the Electron-backed implementations and satisfy the
 * ports structurally — consumers depend on the port types, not on Electron.
 *
 * @module capabilities/electron-factories
 */

import { shell, type BrowserWindow } from 'electron';
import { TrayManager } from '../modules/tray';
import { ShortcutManager } from '../modules/shortcuts';
import { AutoLaunchManager, type AutoLaunchConfig } from '../modules/autolaunch';
import { initNotificationService } from '../services';
import type { WindowManager } from '../lifecycle/window-manager';
import type {
  AutoLaunchPort,
  ExternalEditorPort,
  NotificationPort,
  ShortcutPort,
  TrayPort,
} from './ports';

/** Options accepted by {@link createElectronNotificationPort}. */
export interface NotificationPortOptions {
  /** Host-owned main window bound at construction. */
  mainWindow: BrowserWindow;
  /** Host-owned window manager needed by the custom notification renderer. */
  windowManager: WindowManager;
  /** Resolve the active Profile's narrow notification preference file. */
  resolveDevicePreferencePath: () => string | null;
}

/** Options accepted by {@link createElectronAutoLaunchPort}. */
export type AutoLaunchPortOptions = Partial<AutoLaunchConfig>;

/**
 * Build the tray capability port backed by {@link TrayManager}.
 *
 * `TrayManager` satisfies {@link TrayPort} structurally (it owns the tray
 * lifecycle, flash signalling, and window toggle). A host-provided window is
 * required at construction because the tray drives that window's visibility.
 */
export function createElectronTrayPort(mainWindow: BrowserWindow): TrayPort {
  const manager = new TrayManager(mainWindow);
  return {
    // The narrow port window is host-provided by the caller; in the Electron
    // process it is the real BrowserWindow, so the adapter narrows the cast
    // instead of leaking Electron types through the port.
    setWindow: (window) => manager.setMainWindow(window as BrowserWindow),
    startFlashing: () => manager.startFlashing(),
    stopFlashing: () => manager.stopFlashing(),
    destroy: () => manager.destroy(),
  };
}

/**
 * Build the global-shortcut capability port backed by {@link ShortcutManager}.
 *
 * `ShortcutManager` satisfies {@link ShortcutPort} except for `destroy`, which
 * this adapter supplies by unregistering every shortcut the manager owns.
 */
export function createElectronShortcutPort(mainWindow: BrowserWindow): ShortcutPort {
  const manager = new ShortcutManager(mainWindow);
  return {
    setWindow: (window) => manager.setMainWindow(window as BrowserWindow),
    getShortcuts: () => manager.getShortcuts(),
    register: (config) => manager.register(config),
    unregister: (accelerator) => manager.unregister(accelerator),
    unregisterAll: () => manager.unregisterAll(),
    destroy: () => manager.unregisterAll(),
  };
}

/**
 * Build the auto-launch capability port from {@link AutoLaunchManager}.
 *
 * `AutoLaunchManager` structurally satisfies {@link AutoLaunchPort}. The
 * factory passes host options (product name, hidden start) through unchanged.
 */
export function createElectronAutoLaunchPort(
  options?: AutoLaunchPortOptions,
): AutoLaunchPort {
  return new AutoLaunchManager(options);
}

/**
 * Build the notification capability port from `NotificationService`.
 *
 * The service maintains Do-Not-Disturb state and renders via the custom/native
 * renderers. The broad
 * `initNotificationService` farm is narrowed here to the port surface: boolean
 * "was rendered" returns and no Electron leakage.
 */
export function createElectronNotificationPort(
  options: NotificationPortOptions,
): NotificationPort {
  const service = initNotificationService(
    options.mainWindow,
    options.windowManager,
    options.resolveDevicePreferencePath,
  );
  return {
    getDevicePreference: () => service.getDevicePreference(),
    updateDevicePreference: (patch) => service.updateDevicePreference(patch),
    resetDevicePreference: () => service.resetDevicePreference(),
    enableDND: () => service.enableDND(),
    disableDND: () => service.disableDND(),
    toggleDND: () => service.toggleDND(),
    isDNDEnabled: () => service.isDNDEnabled(),
    setDNDSchedule: (startHour, endHour) => service.setDNDSchedule(startHour, endHour),
    disableDNDSchedule: () => service.disableDNDSchedule(),
    getDNDConfig: () => service.getDNDConfig(),
    show: (config) => service.showCanonicalDelivery(config),
    showReminder: (config) =>
      service.showReminderNotification(config) !== null,
    showSchedule: (config) => service.showScheduleNotification(config) !== null,
    showGoalProgress: (config) => service.showGoalProgressNotification(config) !== null,
    showTaskCompleted: (config) => service.showTaskCompletedNotification(config) !== null,
    destroy: () => undefined,
  };
}

/**
 * Build the external-editor capability port over Electron's `shell.openExternal`.
 *
 * This is the second of the capability seams in the product: it opens an
 * editor URI (`obsidian://`) through the OS default handler.
 */
export function createElectronExternalEditorPort(): ExternalEditorPort {
  return {
    async openExternal(uri: string): Promise<void> {
      await shell.openExternal(uri);
    },
  };
}
