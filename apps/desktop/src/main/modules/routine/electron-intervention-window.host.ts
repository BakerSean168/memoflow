import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RoutineWindowChannels,
  type InterventionWindowProjection,
} from '@memoflow/contracts/electron';
import type { InterventionWindowHost } from './intervention-window-controller';
import { resolvePreloadPath } from '../../utils/resolve-preload-path';
import { getDesktopDevServerUrlOrDefault, usesDesktopViteDevServer } from '../../utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WIDTH = 360;
const GENTLE_HEIGHT = 196;
const GUIDED_HEIGHT = 280;
const EDGE_MARGIN = 24;

export interface ElectronInterventionWindowHostOptions {
  readonly preloadPath?: string;
  readonly devServerUrl?: string;
  readonly isDev?: boolean;
}

/** Main-process owner for the short-lived Routine InterventionWindow surface. */
export class ElectronInterventionWindowHost implements InterventionWindowHost {
  private window: BrowserWindow | null = null;
  private projection: InterventionWindowProjection | null = null;
  private destroying = false;
  private readonly closeListeners = new Set<() => void>();

  private readonly preloadPath: string;
  private readonly devServerUrl: string;
  private readonly isDev: boolean;

  constructor(options: ElectronInterventionWindowHostOptions = {}) {
    this.preloadPath = options.preloadPath ?? resolvePreloadPath(__dirname);
    this.devServerUrl = options.devServerUrl ?? getDesktopDevServerUrlOrDefault();
    this.isDev = options.isDev ?? usesDesktopViteDevServer();
  }

  get browserWindow(): BrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null;
  }

  show(projection: InterventionWindowProjection): void {
    this.projection = projection;
    const window = this.ensureWindow();
    this.placeWindow(window, projection);
    if (!window.webContents.isLoading()) this.pushProjection();
    // Ambient interventions are visible but must not steal IDE/game/meeting focus.
    window.showInactive();
  }

  update(projection: InterventionWindowProjection): void {
    this.projection = projection;
    const window = this.browserWindow;
    if (!window) return;
    this.placeWindow(window, projection);
    this.pushProjection();
  }

  hide(): void {
    this.browserWindow?.hide();
  }

  onCloseRequested(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  destroy(): void {
    if (this.destroying) return;
    this.destroying = true;
    const window = this.window;
    this.window = null;
    this.projection = null;
    this.closeListeners.clear();
    if (window && !window.isDestroyed()) window.destroy();
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;

    this.destroying = false;
    const window = new BrowserWindow({
      width: WIDTH,
      height: GENTLE_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
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
      for (const listener of this.closeListeners) listener();
    });
    window.on('closed', () => {
      if (this.window === window) this.window = null;
    });
    window.webContents.on('render-process-gone', () => {
      if (!this.destroying && !window.isDestroyed()) window.webContents.reload();
    });
    window.webContents.on('did-finish-load', () => this.pushProjection());

    if (this.isDev) {
      void window.loadURL(`${this.devServerUrl}#/intervention-window`);
    } else {
      const htmlPath = path.join(__dirname, '../dist-renderer/index.html');
      void window.loadFile(htmlPath, { hash: '/intervention-window' });
    }
    return window;
  }

  private placeWindow(window: BrowserWindow, projection: InterventionWindowProjection): void {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const height = projection.state === 'Guided' ? GUIDED_HEIGHT : GENTLE_HEIGHT;
    const { x, y, width, height: workAreaHeight } = display.workArea;
    window.setBounds({
      x: x + width - WIDTH - EDGE_MARGIN,
      y: y + workAreaHeight - height - EDGE_MARGIN,
      width: WIDTH,
      height,
    });
  }

  private pushProjection(): void {
    const window = this.browserWindow;
    if (!window || window.webContents.isLoading() || !this.projection) return;
    window.webContents.send(RoutineWindowChannels.INTERVENTION_WINDOW_PROJECTION, this.projection);
  }
}
