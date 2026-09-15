/**
 * Desktop Features Management
 *
 * 统一管理桌面原生特性。所有能力通过 {@link CapabilityRegistry} 注册（Electron-first
 * factories），消费方只依赖窄端口（TrayPort/ShortcutPort/AutoLaunchPort/NotificationPort），
 * 绝不直接构造或持有 Electron 管理器实例。
 *
 * - 系统托盘（TrayPort）
 * - 全局快捷键（ShortcutPort）
 * - 开机自启（AutoLaunchPort）
 * - 通知（NotificationPort）
 */

import type { BrowserWindow } from 'electron';
import {
  CapabilityRegistry,
  createElectronAutoLaunchPort,
  createElectronExternalEditorPort,
  createElectronNotificationPort,
  createElectronShortcutPort,
  createElectronTrayPort,
  type AutoLaunchPortOptions,
} from '../capabilities';
import type {
  AutoLaunchPort,
  CapabilityMainWindow,
  ExternalEditorPort,
  NotificationPort,
  ShortcutPort,
  TrayPort,
} from '../capabilities/ports';
import type { WindowManager } from '../lifecycle/window-manager';

/** Runtime options accepted by {@link initializeDesktopFeatures}. */
export interface DesktopFeaturesOptions {
  /** The window the tray/shortcuts drive (bound via the ports). */
  mainWindow: BrowserWindow;
  /** Window manager required by the notification renderer. */
  windowManager: WindowManager;
  /** Active Profile resolver for the narrow device notification preference owner. */
  resolveDeviceNotificationPreferencePath: () => string | null;
  /** Auto-launch provider configuration. */
  autoLaunch?: AutoLaunchPortOptions;
}

/**
 * Owns the ready desktop capability ports for the lifetime of the desktop
 * shell. Ports are read through the setter-free accessors so a failed
 * capability surfaces as `null` (degraded) instead of aborting startup.
 */
export class DesktopFeaturesRuntime {
  constructor(private readonly registry: CapabilityRegistry) {}

  /** The tray capability port (null when degraded/unavailable). */
  get tray(): TrayPort | null {
    return this.registry.getTray();
  }

  /** The global-shortcut capability port (null when degraded/unavailable). */
  get shortcut(): ShortcutPort | null {
    return this.registry.getShortcut();
  }

  /** The auto-launch capability port (null when degraded/unavailable). */
  get autolaunch(): AutoLaunchPort | null {
    return this.registry.getAutoLaunch();
  }

  /** The notification capability port (null when degraded/unavailable). */
  get notification(): NotificationPort | null {
    return this.registry.getNotification();
  }

  /** The external-editor capability port (null when degraded/unavailable). */
  get externalEditor(): ExternalEditorPort | null {
    return this.registry.getExternalEditor();
  }

  /** Rebind the host window the window-binding ports control. */
  bindWindow(mainWindow: CapabilityMainWindow): void {
    this.tray?.setWindow(mainWindow);
    this.shortcut?.setWindow(mainWindow);
  }

  /** Dispose every ready capability port (degradation-safe). */
  async destroy(): Promise<void> {
    await this.registry.shutdown();
  }
}

/**
 * 初始化所有桌面能力，通过 CapabilityRegistry 走 degradation gate。
 *
 * 每个能力都经由 Electron-first factory 注册；工厂抛错或返回 UNAVAILABLE 时该能力被
 * 记为「不可用」并降级，而不是中断启动。消费方通过返回的 {@link DesktopFeaturesRuntime}
 * 端口取用能力。
 *
 * @param options 端口宿主依赖（主窗口、窗口管理器、auto-launch 选项）
 */
export async function initializeDesktopFeatures(
  options: DesktopFeaturesOptions,
): Promise<DesktopFeaturesRuntime> {
  const { mainWindow, windowManager, resolveDeviceNotificationPreferencePath, autoLaunch } = options;
  console.log('[Desktop Features] Initializing via CapabilityRegistry...');

  const registry = new CapabilityRegistry();

  await registry.register('tray', () => createElectronTrayPort(mainWindow), (port) => port.destroy());
  await registry.register('shortcut', () => createElectronShortcutPort(mainWindow), (port) => port.destroy());
  await registry.register('autolaunch', async () => {
    const port = createElectronAutoLaunchPort(autoLaunch ?? { name: 'MemoFlow', isHidden: true });
    await port.init();
    return port;
  });
  await registry.register('notification', () =>
    createElectronNotificationPort({
      mainWindow,
      windowManager,
      resolveDevicePreferencePath: resolveDeviceNotificationPreferencePath,
    }),
  );
  await registry.register('external-editor', () => createElectronExternalEditorPort());

  console.log('[Desktop Features] Capability registry initialized');
  return new DesktopFeaturesRuntime(registry);
}
