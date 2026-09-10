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
import path from 'node:path';
import type { AutoLaunchPort, NotificationPort, ShortcutPort, TrayPort } from '../capabilities/ports';
import { getIpcCache } from '../utils';
import { getSharedPathResolver, updateUserFilesRootPath } from '../runtime-init';
import { resolveDesktopUserFilesPath } from '../user-data-path';
import {
  DesktopFeatureChannels,
  SystemChannels,
} from '@memoflow/contracts/electron';
import { DesktopNotificationPreferencePatchSchema } from '@memoflow/contracts/electron';
import { fail, ok } from '@memoflow/contracts/result';

type UserFilesSubdirectory = 'exports' | 'downloads' | 'attachments';

interface SaveTextFileRequest {
  subdirectory?: UserFilesSubdirectory;
  defaultFileName: string;
  content: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

interface SaveTextFileResult {
  canceled: boolean;
  filePath: string | null;
}

interface OpenTextFileRequest {
  subdirectory?: UserFilesSubdirectory;
  filters?: Array<{ name: string; extensions: string[] }>;
}

interface OpenTextFileResult {
  canceled: boolean;
  filePath: string | null;
  content: string | null;
}

function resolveUserFilesDirectory(subdirectory: UserFilesSubdirectory | undefined): string {
  const sharedResolver = getSharedPathResolver();

  switch (subdirectory) {
    case 'downloads':
      return sharedResolver.userFilesDownloadsDir;
    case 'attachments':
      return sharedResolver.userFilesAttachmentsDir;
    case 'exports':
    default:
      return sharedResolver.userFilesExportsDir;
  }
}

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

  ipcMain.handle(SystemChannels.USER_FILES_SAVE_TEXT, async (_event, request: SaveTextFileRequest) => {
    const targetDir = resolveUserFilesDirectory(request?.subdirectory);
    await fs.mkdir(targetDir, { recursive: true });

    const result = await dialog.showSaveDialog({
      defaultPath: path.join(targetDir, request.defaultFileName),
      filters: request.filters,
    });

    if (result.canceled || !result.filePath) {
      return ok<SaveTextFileResult>({ canceled: true, filePath: null });
    }

    await fs.mkdir(path.dirname(result.filePath), { recursive: true });
    await fs.writeFile(result.filePath, request.content, 'utf8');
    return ok<SaveTextFileResult>({ canceled: false, filePath: result.filePath });
  });

  ipcMain.handle(
    SystemChannels.USER_FILES_OPEN_TEXT,
    async (_event, request?: OpenTextFileRequest) => {
      const defaultPath = resolveUserFilesDirectory(request?.subdirectory);
      await fs.mkdir(defaultPath, { recursive: true });

      const result = await dialog.showOpenDialog({
        defaultPath,
        properties: ['openFile'],
        filters: request?.filters,
      });

      if (result.canceled || result.filePaths.length === 0) {
        return ok<OpenTextFileResult>({ canceled: true, filePath: null, content: null });
      }

      const filePath = result.filePaths[0]!;
      const content = await fs.readFile(filePath, 'utf8');
      return ok<OpenTextFileResult>({ canceled: false, filePath, content });
    },
  );

  // ========== User Files Directory Management ==========

  ipcMain.handle(SystemChannels.USER_FILES_GET_PATH, async () => {
    const resolver = getSharedPathResolver();
    const defaultPath = resolveDesktopUserFilesPath();
    return ok({
      currentPath: resolver.userFilesRootDir,
      defaultPath,
      isCustom: resolver.userFilesRootDir !== defaultPath,
    });
  });

  ipcMain.handle(SystemChannels.USER_FILES_PICK_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select User Files Directory',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return ok({ canceled: true, path: null });
    }

    const selectedPath = result.filePaths[0]!;
    updateUserFilesRootPath(selectedPath);

    return ok({ canceled: false, path: selectedPath });
  });

  ipcMain.handle(SystemChannels.USER_FILES_OPEN_DIRECTORY, async () => {
    const resolver = getSharedPathResolver();
    await fs.mkdir(resolver.userFilesRootDir, { recursive: true });
    const error = await shell.openPath(resolver.userFilesRootDir);
    if (error) {
      console.error('[UserFiles] Failed to open directory:', error);
      return fail({
        code: 'INTERNAL_ERROR',
        message: error,
      });
    }
    return ok(null);
  });

  ipcMain.handle(SystemChannels.USER_FILES_RESET_PATH, async () => {
    updateUserFilesRootPath(null);
    const defaultPath = resolveDesktopUserFilesPath();
    return ok({ path: defaultPath });
  });
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

  ipcMain.handle(DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_GET, async () =>
    notificationPort
      ? ok(notificationPort.getDevicePreference())
      : fail({ code: 'SERVICE_UNAVAILABLE', message: 'Desktop notification capability is unavailable' }),
  );
  ipcMain.handle(DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_UPDATE, async (_, patch) => {
    if (!notificationPort) {
      return fail({ code: 'SERVICE_UNAVAILABLE', message: 'Desktop notification capability is unavailable' });
    }
    const parsed = DesktopNotificationPreferencePatchSchema.safeParse(patch);
    if (!parsed.success) {
      return fail({ code: 'VALIDATION_ERROR', message: 'Invalid desktop notification preference patch' });
    }
    return ok(notificationPort.updateDevicePreference(parsed.data));
  });
  ipcMain.handle(DesktopFeatureChannels.NOTIFICATION_DEVICE_PREFERENCE_RESET, async () =>
    notificationPort
      ? ok(notificationPort.resetDevicePreference())
      : fail({ code: 'SERVICE_UNAVAILABLE', message: 'Desktop notification capability is unavailable' }),
  );
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
