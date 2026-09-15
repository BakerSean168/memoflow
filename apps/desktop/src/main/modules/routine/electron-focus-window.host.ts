import { BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import type { FocusWindowProjection } from '@memoflow/contracts/electron';
import { RoutineWindowChannels } from '@memoflow/contracts/electron';
import type { FocusWindowHost } from './focus-window-controller';
import { resolvePreloadPath } from '../../utils/resolve-preload-path';
import { getDesktopDevServerUrlOrDefault, usesDesktopViteDevServer } from '../../utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ElectronFocusWindowHostOptions {
  readonly preloadPath?: string;
  readonly devServerUrl?: string;
  readonly isDev?: boolean;
}

/** Main-process owner for the dedicated Routine FocusWindow surface. */
export class ElectronFocusWindowHost implements FocusWindowHost {
  private window: BrowserWindow | null = null;
  private projection: FocusWindowProjection | null = null;
  private destroying = false;
  private collapsed = false;

  private readonly preloadPath: string;
  private readonly devServerUrl: string;
  private readonly isDev: boolean;

  constructor(options: ElectronFocusWindowHostOptions = {}) {
    this.preloadPath = options.preloadPath ?? resolvePreloadPath(__dirname);
    this.devServerUrl = options.devServerUrl ?? getDesktopDevServerUrlOrDefault();
    this.isDev = options.isDev ?? usesDesktopViteDevServer();
  }

  get browserWindow(): BrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null;
  }

  show(projection: FocusWindowProjection): void {
    this.projection = projection;
    const window = this.ensureWindow();
    if (window.webContents.isLoading()) {
      window.webContents.once('did-finish-load', () => this.pushProjection());
    } else {
      this.pushProjection();
    }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  update(projection: FocusWindowProjection): void {
    this.projection = projection;
    this.pushProjection();
  }

  hide(): void {
    this.window?.hide();
  }

  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    const [width] = window.getSize();
    window.setMinimumSize(320, collapsed ? 104 : 220);
    window.setSize(width, collapsed ? 104 : 300, true);
  }

  setAlwaysOnTop(enabled: boolean): void {
    this.window?.setAlwaysOnTop(enabled, enabled ? 'floating' : 'normal');
  }

  destroy(): void {
    this.destroying = true;
    const window = this.window;
    this.window = null;
    this.projection = null;
    if (window && !window.isDestroyed()) window.destroy();
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;

    this.destroying = false;
    const window = new BrowserWindow({
      width: 360,
      height: this.collapsed ? 104 : 300,
      minWidth: 320,
      minHeight: this.collapsed ? 104 : 220,
      show: false,
      frame: false,
      resizable: true,
      alwaysOnTop: false,
      skipTaskbar: false,
      backgroundColor: '#09090b',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    this.window = window;

    window.on('close', (event) => {
      if (this.destroying) return;
      event.preventDefault();
      window.hide();
    });
    window.on('closed', () => {
      if (this.window === window) this.window = null;
    });

    if (this.isDev) {
      void window.loadURL(`${this.devServerUrl}#/focus-window`);
    } else {
      const htmlPath = path.join(__dirname, '../dist-renderer/index.html');
      void window.loadFile(htmlPath, { hash: '/focus-window' });
    }
    return window;
  }

  private pushProjection(): void {
    const window = this.window;
    if (!window || window.isDestroyed() || window.webContents.isLoading() || !this.projection)
      return;
    window.webContents.send(RoutineWindowChannels.FOCUS_WINDOW_PROJECTION, this.projection);
  }
}
