/**
 * Custom Notification Window Manager
 *
 * Manages a transparent, frameless, always-on-top window for custom
 * notification toasts positioned at the bottom right of the screen.
 *
 * @module services/custom-notification.manager
 */

import { BrowserWindow, screen, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '@memoflow/utils/logger';
import { NotificationChannels, RendererEventChannels } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import type { NotificationOptions } from './notification.service';
import type { WindowManager } from '../lifecycle/window-manager';
import { resolvePreloadPath } from '../utils/resolve-preload-path';
import { getDesktopDevServerUrlOrDefault, usesDesktopViteDevServer } from '../utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = createLogger('CustomNotificationManager');
const MAX_PENDING_NOTIFICATIONS = 32;
const RENDERER_READY_TIMEOUT_MS = 10_000;
const CUSTOM_CHANNELS = [
  NotificationChannels.CUSTOM_CLICK,
  NotificationChannels.CUSTOM_CLOSE,
  NotificationChannels.CUSTOM_RESIZE,
  NotificationChannels.CUSTOM_MOUSE_ENTER,
  NotificationChannels.CUSTOM_MOUSE_LEAVE,
  NotificationChannels.CUSTOM_RENDERER_READY,
];

export class CustomNotificationManager {
  private notificationWindow: BrowserWindow | null = null;
  private isDev = usesDesktopViteDevServer();
  private devServerUrl = getDesktopDevServerUrlOrDefault();
  private preloadPath = resolvePreloadPath(__dirname);

  private notificationQueue = new Map<string, NotificationOptions & { id: string }>();
  private displayed = new Map<string, NotificationOptions & { id: string }>();
  private isRendererReady: boolean = false;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly windowManager: Pick<WindowManager, 'getMainWindow'>) {
    this.registerIpcHandlers();
  }

  private createWindow(): BrowserWindow {
    if (this.notificationWindow && !this.notificationWindow.isDestroyed()) {
      logger.info('[Desktop][CustomNotification] Reusing existing notification window', {
        isVisible: this.notificationWindow.isVisible(),
        isRendererReady: this.isRendererReady,
        queueLength: this.notificationQueue.size,
      });
      return this.notificationWindow;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const {
      x: workAreaX,
      y: workAreaY,
      width: workAreaWidth,
      height: workAreaHeight,
    } = primaryDisplay.workArea;

    // Fixed width for notifications, height is initially small but can grow
    const windowWidth = 360;
    const windowHeight = 10; // Start small, resize later based on content

    const win = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: workAreaX + workAreaWidth - windowWidth - 20, // 20px margin from right
      y: workAreaY + workAreaHeight - windowHeight - 20, // 20px margin from bottom
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      hasShadow: false, // Let CSS handle shadows
      backgroundColor: '#00000000',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: true,
      },
      show: false, // Don't show immediately
    });

    this.isRendererReady = false;
    win.setBackgroundColor('#00000000');
    logger.info('[Desktop][CustomNotification] Creating notification window', {
      isDev: this.isDev,
      devServerUrl: this.devServerUrl,
      preloadPath: this.preloadPath,
      bounds: {
        x: workAreaX + workAreaWidth - windowWidth - 20,
        y: workAreaY + workAreaHeight - windowHeight - 20,
        width: windowWidth,
        height: windowHeight,
      },
    });

    // Make window non-clickable where transparent
    win.setIgnoreMouseEvents(true, { forward: true });

    if (this.isDev) {
      void win.loadURL(`${this.devServerUrl}#/custom-notification`).catch(() => {
        if (this.notificationWindow === win) this.clearPresentation();
      });
    } else {
      void win
        .loadFile(path.join(__dirname, '../dist-renderer/index.html'), {
          hash: '/custom-notification',
        })
        .catch(() => {
          if (this.notificationWindow === win) this.clearPresentation();
        });
    }

    win.webContents.on('did-finish-load', () => {
      logger.info('[Desktop][CustomNotification] Window did-finish-load', {
        url: win.webContents.getURL(),
      });
    });

    win.webContents.on('dom-ready', () => {
      logger.info('[Desktop][CustomNotification] Window dom-ready', {
        url: win.webContents.getURL(),
      });
    });

    win.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        logger.error('[Desktop][CustomNotification] Window did-fail-load', {
          errorCode,
          errorDescription,
          validatedURL,
          isMainFrame,
        });
        if (isMainFrame && this.notificationWindow === win) this.clearPresentation();
      },
    );

    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      logger.info('[Desktop][CustomNotification][Renderer]', {
        level,
        message,
        line,
        sourceId,
      });
    });

    this.notificationWindow = win;
    this.armReadyDeadline(win);
    win.webContents.on('did-start-loading', () => {
      if (this.notificationWindow !== win) return;
      this.isRendererReady = false;
      this.displayed.clear();
      this.armReadyDeadline(win);
    });
    win.webContents.on('render-process-gone', () => {
      if (this.notificationWindow === win) this.clearPresentation();
    });

    win.on('closed', () => {
      logger.info('[Desktop][CustomNotification] Notification window closed');
      if (this.notificationWindow === win) this.clearPresentation();
    });

    return win;
  }

  private flushQueuedNotifications(reason: string): void {
    if (!this.notificationWindow || this.notificationWindow.isDestroyed()) {
      logger.warn('[Desktop][CustomNotification] Flush skipped because window is unavailable', {
        reason,
        queueLength: this.notificationQueue.size,
      });
      return;
    }

    if (!this.isRendererReady) {
      logger.info('[Desktop][CustomNotification] Flush deferred until renderer is ready', {
        reason,
        queueLength: this.notificationQueue.size,
      });
      return;
    }

    if (this.notificationQueue.size === 0) {
      logger.info('[Desktop][CustomNotification] Flush skipped because queue is empty', {
        reason,
      });
      return;
    }

    logger.info('[Desktop][CustomNotification] Flushing queued notifications', {
      reason,
      queueLength: this.notificationQueue.size,
    });

    for (const notification of this.notificationQueue.values()) {
      this.sendNotification(notification);
    }

    this.notificationQueue.clear();
  }

  private sendNotification(notification: NotificationOptions & { id: string }): void {
    this.displayed.delete(notification.id);
    this.displayed.set(notification.id, notification);
    if (this.displayed.size > MAX_PENDING_NOTIFICATIONS) {
      this.displayed.delete(this.displayed.keys().next().value!);
    }
    this.notificationWindow?.webContents.send(NotificationChannels.CUSTOM_RECEIVE, notification);
  }

  private armReadyDeadline(win: BrowserWindow): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = setTimeout(() => {
      if (this.notificationWindow === win && !this.isRendererReady) this.clearPresentation();
    }, RENDERER_READY_TIMEOUT_MS);
  }

  clearPresentation(): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = null;
    this.notificationQueue.clear();
    this.displayed.clear();
    this.isRendererReady = false;
    const win = this.notificationWindow;
    this.notificationWindow = null;
    if (win && !win.isDestroyed()) win.destroy();
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearPresentation();
    for (const channel of CUSTOM_CHANNELS) ipcMain.removeHandler(channel);
  }

  private isNotificationSender(senderId: number): boolean {
    return !this.disposed && this.notificationWindow?.webContents.id === senderId;
  }

  /**
   * Dispatches a notification to the custom window.
   *
   * @param {NotificationOptions} options - The notification options.
   */
  dispatch(options: NotificationOptions): void {
    if (this.disposed) return;
    const id =
      typeof options.data?.notificationId === 'string' ? options.data.notificationId : randomUUID();
    const notificationWithId = { ...options, id };

    const win = this.createWindow();
    logger.info('[Desktop][CustomNotification] Dispatch requested', {
      id,
      title: options.title,
      isWindowLoading: win.webContents.isLoading(),
      isRendererReady: this.isRendererReady,
      queueLength: this.notificationQueue.size,
    });

    // If renderer is ready, send immediately
    if (this.isRendererReady && win.webContents && !win.webContents.isLoading()) {
      logger.info('[Desktop][CustomNotification] Sending notification to renderer immediately', {
        id,
        title: options.title,
      });
      this.sendNotification(notificationWithId);
    } else {
      this.notificationQueue.delete(id);
      this.notificationQueue.set(id, notificationWithId);
      if (this.notificationQueue.size > MAX_PENDING_NOTIFICATIONS) {
        this.notificationQueue.delete(this.notificationQueue.keys().next().value!);
      }
      logger.info('[Desktop][CustomNotification] Queued notification until renderer is ready', {
        id,
        title: options.title,
        queueLength: this.notificationQueue.size,
      });
      this.flushQueuedNotifications('dispatch');
    }
  }

  /**
   * Registers IPC handlers for custom notifications.
   */
  private registerIpcHandlers(): void {
    // Handle notification click
    ipcMain.handle(NotificationChannels.CUSTOM_CLICK, (event, id: string) => {
      if (!this.isNotificationSender(event.sender.id)) return ok(null);
      const notification = this.displayed.get(id);
      if (!notification) return ok(null);
      const data = notification.data;

      const mainWin = this.windowManager.getMainWindow();

      if (mainWin) {
        if (mainWin.isMinimized()) {
          mainWin.restore();
        }
        mainWin.focus();

        if (data) {
          mainWin.webContents.send(RendererEventChannels.NOTIFICATION_CLICKED, data);
        }
      }
      return ok(null);
    });

    // Handle notification close (manual dismiss)
    ipcMain.handle(NotificationChannels.CUSTOM_CLOSE, (event, id: string) => {
      if (!this.isNotificationSender(event.sender.id)) return ok(null);
      this.displayed.delete(id);
      logger.info('[Desktop][CustomNotification] Notification closed from renderer', { id });
      return ok(null);
    });

    // Handle window resizing dynamically based on notification count/height
    ipcMain.handle(NotificationChannels.CUSTOM_RESIZE, (event, height: number) => {
      if (!this.isNotificationSender(event.sender.id) || !Number.isFinite(height)) return ok(null);
      if (this.notificationWindow && !this.notificationWindow.isDestroyed()) {
        if (height <= 0) {
          logger.info('[Desktop][CustomNotification] Hiding notification window after resize', {
            height,
          });
          this.notificationWindow.hide();
          this.notificationWindow.setIgnoreMouseEvents(true, { forward: true });
        } else {
          const primaryDisplay = screen.getPrimaryDisplay();
          const {
            x: workAreaX,
            y: workAreaY,
            width: workAreaWidth,
            height: workAreaHeight,
          } = primaryDisplay.workArea;
          const windowWidth = 360;
          height = Math.min(Math.ceil(height), workAreaHeight - 40);

          // Reposition to stay anchored to the bottom right
          this.notificationWindow.setBounds({
            x: workAreaX + workAreaWidth - windowWidth - 20,
            y: workAreaY + workAreaHeight - height - 20,
            width: windowWidth,
            height: height,
          });
          logger.info('[Desktop][CustomNotification] Updated notification window bounds', {
            height,
            visible: this.notificationWindow.isVisible(),
          });

          if (!this.notificationWindow.isVisible()) {
            logger.info('[Desktop][CustomNotification] Showing notification window after resize', {
              height,
            });
            this.notificationWindow.showInactive();
          }

          // Note: we don't automatically make it clickable here anymore.
          // We let the mouse-enter/leave events handle it to prevent dead-zones.
        }
      }
      return ok(null);
    });

    // Handle precise mouse interaction to avoid dead-zones in transparent areas
    ipcMain.handle(NotificationChannels.CUSTOM_MOUSE_ENTER, (event) => {
      if (!this.isNotificationSender(event.sender.id)) return ok(null);
      if (this.notificationWindow && !this.notificationWindow.isDestroyed()) {
        logger.info('[Desktop][CustomNotification] Mouse entered notification card');
        // When mouse is explicitly over a card, stop ignoring mouse events so click works
        this.notificationWindow.setIgnoreMouseEvents(false);
      }
      return ok(null);
    });

    ipcMain.handle(NotificationChannels.CUSTOM_MOUSE_LEAVE, (event) => {
      if (!this.isNotificationSender(event.sender.id)) return ok(null);
      if (this.notificationWindow && !this.notificationWindow.isDestroyed()) {
        logger.info('[Desktop][CustomNotification] Mouse left notification card');
        // When mouse leaves a card, start ignoring again to let clicks pass through to apps below
        this.notificationWindow.setIgnoreMouseEvents(true, { forward: true });
      }
      return ok(null);
    });

    ipcMain.handle(NotificationChannels.CUSTOM_RENDERER_READY, (event) => {
      if (!this.isNotificationSender(event.sender.id)) return ok(false);
      if (this.readyTimer) clearTimeout(this.readyTimer);
      this.readyTimer = null;
      this.isRendererReady = true;
      logger.info('[Desktop][CustomNotification] Renderer reported ready', {
        queueLength: this.notificationQueue.size,
      });
      this.flushQueuedNotifications('renderer-ready');
      return ok(true);
    });
  }
}
