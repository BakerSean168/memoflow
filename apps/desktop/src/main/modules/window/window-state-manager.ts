/**
 * @file Window State Manager
 * @description
 * Persists window state (size, position, maximize status) to disk
 * and restores it on application startup.
 *
 * @module modules/window/windowStateManager
 */

import { BrowserWindow, screen } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * @interface WindowState
 * @description Interface defining the structure of the saved window state.
 */
export interface WindowState {
  /** Window width in pixels. */
  width: number;
  /** Window height in pixels. */
  height: number;
  /** Window X coordinate. */
  x?: number;
  /** Window Y coordinate. */
  y?: number;
  /** Whether the window is maximized. */
  isMaximized: boolean;
}

/**
 * @interface WindowStateManagerOptions
 * @description Interface for configuration options when creating a WindowStateManager.
 */
export interface WindowStateManagerOptions {
  /** Default width if no state is saved. */
  defaultWidth: number;
  /** Default height if no state is saved. */
  defaultHeight: number;
  /** Explicit path for the persisted window state file. */
  stateFilePath: string;
}

/**
 * @class WindowStateManager
 * @description Manages the persistence and restoration of an Electron window's state.
 */
export class WindowStateManager {
  private state: WindowState;
  private winRef: BrowserWindow | null = null;
  private stateChangeTimer: NodeJS.Timeout | null = null;
  private readonly configPath: string;
  private readonly windowName: string;
  private readonly options: WindowStateManagerOptions;

  /**
   * @constructor
   * @description Creates an instance of WindowStateManager.
   *
   * @param {string} windowName - A unique name for the window (used for the filename).
   * @param {WindowStateManagerOptions} options - Configuration options.
   */
  constructor(windowName: string, options: WindowStateManagerOptions) {
    this.windowName = windowName;
    this.options = options;
    this.configPath = options.stateFilePath;
    this.state = this.loadState();
  }

  /**
   * @getter x
   * @description Returns the x position from the saved state, or undefined if not set.
   */
  get x(): number | undefined {
    return this.state.x;
  }

  /**
   * @getter y
   * @description Returns the y position from the saved state, or undefined if not set.
   */
  get y(): number | undefined {
    return this.state.y;
  }

  /**
   * @getter width
   * @description Returns the width from the saved state.
   */
  get width(): number {
    return this.state.width;
  }

  /**
   * @getter height
   * @description Returns the height from the saved state.
   */
  get height(): number {
    return this.state.height;
  }

  /**
   * @getter isMaximized
   * @description Returns whether the window was maximized in the saved state.
   */
  get isMaximized(): boolean {
    return this.state.isMaximized;
  }

  /**
   * @method manage
   * @description Registers a BrowserWindow to be managed.
   * Attaches event listeners to track resize, move, and close events.
   *
   * @param {BrowserWindow} win - The Electron BrowserWindow instance.
   */
  manage(win: BrowserWindow): void {
    this.winRef = win;

    if (this.state.isMaximized) {
      win.maximize();
    }

    win.on('resize', this.stateChangeHandler);
    win.on('move', this.stateChangeHandler);
    win.on('close', this.closeHandler);
  }

  /**
   * @method unmanage
   * @description Unregisters the managed window and removes event listeners.
   */
  unmanage(): void {
    if (this.winRef) {
      this.winRef.removeListener('resize', this.stateChangeHandler);
      this.winRef.removeListener('move', this.stateChangeHandler);
      this.winRef.removeListener('close', this.closeHandler);
      this.winRef = null;
    }
  }

  /**
   * @method stateChangeHandler
   * @description Handler for window state change events (resize, move).
   * Updates the internal state and schedules a save to disk.
   */
  private stateChangeHandler = (): void => {
    if (this.stateChangeTimer) {
      clearTimeout(this.stateChangeTimer);
    }

    this.stateChangeTimer = setTimeout(() => {
      this.updateState();
    }, 100);
  };

  /**
   * @method closeHandler
   * @description Handler for the close event.
   * Ensures state is saved immediately before the window closes.
   */
  private closeHandler = (): void => {
    this.updateState();
  };

  private updateState(): void {
    if (!this.winRef) return;

    try {
      const windowBounds = this.winRef.getBounds();
      const isMaximized = this.winRef.isMaximized();

      if (isMaximized) {
        this.state.isMaximized = true;
      } else {
        this.state.isMaximized = false;
        this.state.x = windowBounds.x;
        this.state.y = windowBounds.y;
        this.state.width = windowBounds.width;
        this.state.height = windowBounds.height;
      }

      this.saveState();
    } catch (_error) {
      // Window might be destroyed
    }
  }

  /**
   * @method saveState
   * @description Saves the current state to disk.
   */
  private saveState(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.state));
    } catch (_error) {
      // Ignore write errors
    }
  }

  /**
   * @method loadState
   * @description Loads the state from disk.
   * If the file doesn't exist or is invalid, returns the default state.
   * Validates that the saved position is within current screen bounds.
   *
   * @returns {WindowState} The loaded or default state.
   */
  private loadState(): WindowState {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        const state = JSON.parse(data);
        if (this.validateState(state)) {
          return state;
        }
      }
    } catch (_error) {
      // Ignore read errors
    }

    return {
      width: this.options.defaultWidth,
      height: this.options.defaultHeight,
      isMaximized: false,
    };
  }

  /**
   * @method validateState
   * @description Validates if the given state is visible on any currently connected display.
   *
   * @param {WindowState} state - The state to check.
   * @returns {boolean} True if the window would be visible, false otherwise.
   */
  private validateState(state: WindowState): boolean {
    if (!state || typeof state.width !== 'number' || typeof state.height !== 'number') {
      return false;
    }

    if (state.x !== undefined && state.y !== undefined) {
      const displays = screen.getAllDisplays();
      const visible = displays.some((display) => {
        const bounds = display.bounds;
        return (
          state.x! >= bounds.x &&
          state.x! < bounds.x + bounds.width &&
          state.y! >= bounds.y &&
          state.y! < bounds.y + bounds.height
        );
      });

      if (!visible) {
        return false;
      }
    }

    return true;
  }
}
