/**
 * @file Tray Manager
 * @description
 * Manages the application system tray icon, context menu, and flash notifications.
 *
 * @module modules/tray/trayManager
 */

import { Tray, Menu, app, type BrowserWindow, type NativeImage } from 'electron';
import { APP_DISPLAY_NAME } from '@memoflow/assets';
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
  constructor(private mainWindow: BrowserWindow) {
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
      this.tray.setToolTip(APP_DISPLAY_NAME);
      this.updateContextMenu();

      this.tray.on('click', () => {
        this.toggleWindow();
      });
    } catch (error) {
      console.error('Failed to create tray icon:', error);
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
        label: 'Show App',
        click: () => this.mainWindow.show(),
      },
      {
        label: 'Settings',
        click: () => {
          this.mainWindow.show();
          this.mainWindow.webContents.send('navigate', '/settings');
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  /**
   * @method toggleWindow
   * @description Toggles the main window visibility.
   */
  private toggleWindow(): void {
    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide();
    } else {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
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
