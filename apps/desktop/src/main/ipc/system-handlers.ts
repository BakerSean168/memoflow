/**
 * @file System IPC Handlers
 * @description
 * Centralized registration for system-level IPC channels, including:
 * - system:* - System utilities (version, memory usage, performance stats).
 * - desktop:* - Desktop features (auto-launch, shortcuts, tray).
 *
 * Handlers return contracts Result ok/fail envelopes (no raw dual-track payloads).
 *
 * @module ipc/system-handlers
 */

import { app, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs/promises';
import type {
  AutoLaunchPort,
  NotificationPort,
  ShortcutPort,
  TrayPort,
} from '../capabilities/ports';
import { getIpcCache } from '../utils';
import { getSharedPathResolver } from '../runtime-init';
import {
  NativeFileDialogs,
  type SaveTextFileRequest,
  type OpenTextFileRequest,
} from '../paths/native-file-dialogs';
import { DesktopFeatureChannels, SystemChannels } from '@memoflow/desktop-contracts';
import { DesktopNotificationPreferencePatchSchema } from '@memoflow/desktop-contracts';
import { fail, ok } from '@memoflow/transport-contracts/result';

/**
 * @function registerSystemHandlers
 * @description Registers system-level utility IPC handlers.
 * Channels: SystemChannels.GET_APP_VERSION, SystemChannels.GET_MEMORY_USAGE, SystemChannels.GET_IPC_CACHE_STATS
 */
function registerSystemHandlers(): void {
  /**
   * @description 获取应用版本
   * Channel Name: system:getAppVersion
   * Payload: void
   * Return: Result<string>
   * Security: None
   */
  ipcMain.handle(SystemChannels.GET_APP_VERSION, async () => {
    return ok(app.getVersion());
  });

  /**
   * @description 获取内存使用情况
   * Channel Name: system:getMemoryUsage
   * Payload: void
   * Return: Result<MemoryUsage>
   * Security: Requires authentication
   */
  ipcMain.handle(SystemChannels.GET_MEMORY_USAGE, async () => {
    const usage = process.memoryUsage();
    return ok({
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024),
      rss: Math.round(usage.rss / 1024 / 1024),
    });
  });

  /**
   * @description 获取 IPC 缓存统计
   * Channel Name: system:getIpcCacheStats
   * Payload: void
   * Return: Result<CacheStats>
   * Security: Requires authentication
   */
  ipcMain.handle(SystemChannels.GET_IPC_CACHE_STATS, async () => {
    return ok(getIpcCache().getStats());
  });

  ipcMain.handle(SystemChannels.OPEN_EXTERNAL_URL, async (_event, request: { url?: unknown }) => {
    if (typeof request?.url !== 'string') {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'External URL is required',
      });
    }

    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'External URL is invalid',
      });
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Only HTTP(S) external URLs are allowed',
      });
    }

    await shell.openExternal(url.toString());
    return ok({ opened: true as const });
  });

  const files = new NativeFileDialogs(getSharedPathResolver().configDir, dialog, async () => {
    const downloads = app.getPath('downloads');
    try {
      if ((await fs.stat(downloads)).isDirectory()) return downloads;
    } catch {
      /* WSL and fresh homes may have no Downloads directory. */
    }
    return app.getPath('home');
  });
  ipcMain.handle(
    SystemChannels.USER_FILES_SAVE_TEXT,
    async (_event, request: SaveTextFileRequest) => ok(await files.save(request)),
  );
  ipcMain.handle(
    SystemChannels.USER_FILES_OPEN_TEXT,
    async (_event, request?: OpenTextFileRequest) => ok(await files.open(request)),
  );
}

/**
 * @function registerDesktopFeaturesHandlers
 * @description Registers desktop feature IPC handlers (Tray, Shortcuts, AutoLaunch).
 * Channels start with 'desktop:'.
 *
 * @param {TrayPort | null} trayPort - The tray capability port (null when degraded).
 * @param {ShortcutPort | null} shortcutPort - The shortcut capability port (null when degraded).
 * @param {AutoLaunchPort | null} autoLaunchPort - The auto-launch capability port (null when degraded).
 */
function registerDesktopFeaturesHandlers(
  trayPort: TrayPort | null,
  shortcutPort: ShortcutPort | null,
  autoLaunchPort: AutoLaunchPort | null,
  notificationPort: NotificationPort | null,
): void {
  // ========== Auto Launch ==========
  /**
   * @description 检查自动启动状态
   * Channel Name: desktop:autoLaunch:isEnabled
   * Payload: void
   * Return: Result<boolean>
   * Security: None
   */
  ipcMain.handle(DesktopFeatureChannels.AUTO_LAUNCH_IS_ENABLED, async () => {
    return ok((await autoLaunchPort?.isEnabled()) ?? false);
  });

  /**
   * @description 启用自动启动
   * Channel Name: desktop:autoLaunch:enable
   * Payload: void
   * Return: Result<boolean>
   * Security: None
   */
  ipcMain.handle(DesktopFeatureChannels.AUTO_LAUNCH_ENABLE, async () => {
    return ok((await autoLaunchPort?.enable()) ?? false);
  });

  /**
   * @description 禁用自动启动
   * Channel Name: desktop:autoLaunch:disable
   * Payload: void
   * Return: Result<boolean>
   * Security: None
   */
  ipcMain.handle(DesktopFeatureChannels.AUTO_LAUNCH_DISABLE, async () => {
    return ok((await autoLaunchPort?.disable()) ?? false);
  });

  // Shortcuts
  /**
   * @description 获取所有快捷键
   * Channel Name: desktop:shortcuts:getAll
   * Payload: void
   * Return: Result<ShortcutConfig[]>
   * Security: None
   */
  ipcMain.handle(DesktopFeatureChannels.SHORTCUTS_GET_ALL, async () => {
    return ok(shortcutPort?.getShortcuts() ?? []);
  });

  /**
   * @description 更新快捷键配置
   * Channel Name: desktop:shortcuts:update
   * Payload: accelerator (string), newConfig (object)
   * Return: Result<boolean>
   * Security: None
   */
  ipcMain.handle(
    DesktopFeatureChannels.SHORTCUTS_UPDATE,
    async (_, accelerator: string, newConfig: { enabled?: boolean }) => {
      if (!shortcutPort) return ok(false);
      if (newConfig.enabled === false) {
        shortcutPort.unregister(accelerator);
      } else {
        const shortcuts = shortcutPort.getShortcuts();
        const existing = shortcuts.find((s) => s.accelerator === accelerator);
        if (existing) {
          shortcutPort.register({ ...existing, enabled: true });
        }
      }
      return ok(true);
    },
  );

  // Tray
  /**
   * @description 开始托盘图标闪烁
   * Channel Name: desktop:tray:flash
   * Payload: void
   * Return: Result<null>
   * Security: None
   */
  ipcMain.handle(DesktopFeatureChannels.TRAY_FLASH, async () => {
    trayPort?.startFlashing();
    return ok(null);
  });

  /**
   * @description 停止托盘图标闪烁
   * Channel Name: desktop:tray:stopFlash
   * Payload: void
   * Return: Result<null>
   * Security: None
   */
  ipcMain.handle(DesktopFeatureChannels.TRAY_STOP_FLASH, async () => {
    trayPort?.stopFlashing();
    return ok(null);
  });

  const devicePreferenceUnavailable = () =>
    fail({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Desktop notification preference requires an active Profile',
    });

  ipcMain.handle(DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_GET, async () => {
    if (!notificationPort) return devicePreferenceUnavailable();
    try {
      return ok(notificationPort.getDevicePreference());
    } catch {
      return devicePreferenceUnavailable();
    }
  });
  ipcMain.handle(DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_UPDATE, async (_, patch) => {
    if (!notificationPort) return devicePreferenceUnavailable();
    const parsed = DesktopNotificationPreferencePatchSchema.safeParse(patch);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid desktop notification preference patch',
      });
    }
    try {
      return ok(notificationPort.updateDevicePreference(parsed.data));
    } catch {
      return devicePreferenceUnavailable();
    }
  });
  ipcMain.handle(DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_RESET, async () => {
    if (!notificationPort) return devicePreferenceUnavailable();
    try {
      return ok(notificationPort.resetDevicePreference());
    } catch {
      return devicePreferenceUnavailable();
    }
  });
}

// Flag to prevent duplicate handler registration
let systemHandlersRegistered = false;

/**
 * @function registerSystemIpcHandlers
 * @description Registers all system-level IPC handlers.
 *
 * This function is idempotent - calling it multiple times is safe.
 * Handlers are only registered once on the first call.
 *
 * @param {TrayPort | null} trayPort - The tray capability port (null when degraded).
 * @param {ShortcutPort | null} shortcutPort - The shortcut capability port (null when degraded).
 * @param {AutoLaunchPort | null} autoLaunchPort - The auto-launch capability port (null when degraded).
 */
export function registerSystemIpcHandlers(
  trayPort: TrayPort | null,
  shortcutPort: ShortcutPort | null,
  autoLaunchPort: AutoLaunchPort | null,
  notificationPort: NotificationPort | null = null,
): void {
  // Prevent duplicate registration
  if (systemHandlersRegistered) {
    console.log('[SystemHandlers] Already registered, skipping...');
    return;
  }
  systemHandlersRegistered = true;

  // ========== System Channels ==========
  registerSystemHandlers();

  // ========== Desktop Features Channels ==========
  registerDesktopFeaturesHandlers(trayPort, shortcutPort, autoLaunchPort, notificationPort);
}
