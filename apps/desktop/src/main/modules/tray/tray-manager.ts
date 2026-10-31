/**
 * @file Tray Manager
 * @description
 * Manages the application system tray icon, context menu, and flash notifications.
 *
 * @module modules/tray/trayManager
 */

import { Tray, Menu, app, type BrowserWindow, type NativeImage } from 'electron';
import { RendererEventChannels } from '@memoflow/desktop-contracts';
import { APP_DISPLAY_NAME } from '@memoflow/assets';
import type { DesktopLifecyclePreference } from '../../lifecycle/desktop-lifecycle-preference';
import { resolveTrayIcon } from '../../utils/app-icon';

/**
 * @class TrayManager
 * @description Class for managing the system tray integration.
 */
export class TrayManager {
  private tray: Tray | null = null;
  private flashTimer: NodeJS.Timeout | null = null;
  private isFlashing = false;
  private readonly iconImage: NativeImage | string;
  private readonly trayGuid?: string;

  /**
   * @constructor
   * @description Creates an instance of TrayManager.
   *
   * @param {BrowserWindow} mainWindow - The main application window.
   */
  constructor(
    private mainWindow: BrowserWindow,
    private readonly options: {
      restore?: () => void;
      canNavigate?: () => boolean;
      preference?: DesktopLifecyclePreference;
    } = {},
  ) {
    const trayIcon = resolveTrayIcon();
    this.iconImage = trayIcon.image;
    this.trayGuid = trayIcon.guid;
    this.init();
  }

  setMainWindow(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
  }

  destroy(): void {
    this.stopFlashing();
    this.tray?.destroy();
    this.tray = null;
  }

  /**
   * @method init
   * @description Initializes the tray icon and context menu.
   */
  private init(): void {
    try {
      this.tray = this.trayGuid
        ? new Tray(this.iconImage, this.trayGuid)
        : new Tray(this.iconImage);
      this.tray.setToolTip(`${APP_DISPLAY_NAME} — ${this.labels.background}`);
      this.updateContextMenu();

      this.tray.on('click', () => {
        this.showWindow();
      });
      this.tray.on('double-click', () => this.showWindow());
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  /**
   * @method updateContextMenu
   * @description Updates the tray context menu.
   */
  private updateContextMenu(): void {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: this.labels.open,
        click: () => this.showWindow(),
      },
      {
        label: this.labels.settings,
        click: () => {
          this.showWindow();
          if (!this.mainWindow.isDestroyed() && (this.options.canNavigate?.() ?? true))
            this.mainWindow.webContents.send(RendererEventChannels.TRAY_ACTION, 'settings');
        },
      },
      ...(this.options.preference
        ? [
            {
              label: this.labels.behavior,
              submenu: [
                {
                  label: this.labels.closeToTray,
                  type: 'checkbox' as const,
                  checked: this.options.preference.closeToTray,
                  click: (item: { checked: boolean }) =>
                    this.updatePreference('closeToTray', item.checked),
                },
                {
                  label: this.labels.startHidden,
                  type: 'checkbox' as const,
                  checked: this.options.preference.startHidden,
                  click: (item: { checked: boolean }) =>
                    this.updatePreference('startHidden', item.checked),
                },
              ],
            },
          ]
        : []),
      { type: 'separator' },
      {
        label: this.labels.quit,
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  /**
   * @method showWindow
   * @description Restores the active window through the Profile gate.
   */
  private showWindow(): void {
    if (this.options.restore) {
      this.options.restore();
      return;
    }
    if (this.mainWindow.isDestroyed()) return;
    if (this.mainWindow.isMinimized()) this.mainWindow.restore();
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  private updatePreference(key: 'closeToTray' | 'startHidden', value: boolean): void {
    try {
      this.options.preference?.update(key, value);
    } catch (error) {
      console.error('Could not save desktop lifecycle preference', error);
    }
    this.updateContextMenu();
  }

  private get labels() {
    return app.getLocale().startsWith('zh')
      ? {
          open: '打开 MemoFlow',
          settings: '设置',
          quit: '退出 MemoFlow',
          background: '后台运行',
          behavior: '窗口与启动设置',
          closeToTray: '关闭到托盘（取消则关闭即退出）',
          startHidden: '开机自启时启动到托盘（不启用自启）',
        }
      : {
          open: 'Open MemoFlow',
          settings: 'Settings',
          quit: 'Quit MemoFlow',
          background: 'Running in background',
          behavior: 'Window and startup settings',
          closeToTray: 'Close to tray (otherwise quit)',
          startHidden: 'Start in tray at login (does not enable auto-start)',
        };
  }

  /**
   * @method startFlashing
   * @description Starts flashing the tray icon to indicate a notification.
   */
  startFlashing(): void {
    if (this.isFlashing || !this.tray) return;

    this.isFlashing = true;
    this.flashTimer = setInterval(() => {
      if (!this.tray) return;
      // Note: This requires two icon files or programmatic image manipulation
      // For now, keep the icon stable and reserve this hook for future variants.
    }, 500);
  }

  /**
   * @method stopFlashing
   * @description Stops flashing the tray icon.
   */
  stopFlashing(): void {
    if (!this.isFlashing) return;

    this.isFlashing = false;
    if (this.flashTimer) {
      clearInterval(this.flashTimer);
      this.flashTimer = null;
    }

    if (this.tray) {
      this.tray.setImage(this.iconImage);
    }
  }
}
