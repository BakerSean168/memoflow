/**
 * AutoLaunchManager
 *
 * Manages the application's auto-launch behavior on system startup.
 * Uses Electron's native APIs for macOS and the `auto-launch` library for Windows/Linux.
 *
 * @module modules/autolaunch
 */

import { app } from 'electron';

// Dynamic import for auto-launch as it's an optional dependency and platform specific

interface AutoLaunchInstance {
  isEnabled(): Promise<boolean>;
  enable(): Promise<void>;
  disable(): Promise<void>;
}

interface AutoLaunchConstructor {
  new (config: { name: string; path: string; isHidden?: boolean }): AutoLaunchInstance;
}

let AutoLaunchClass: AutoLaunchConstructor | null = null;

/**
 * Configuration for AutoLaunchManager.
 */
export interface AutoLaunchConfig {
  /** The application name used for the registry entry (Windows/Linux). */
  name: string;
  /** Whether to launch the application in hidden mode on Windows/Linux. */
  isHidden?: boolean;
}

/**
 * Class to manage auto-launch settings.
 */
export class AutoLaunchManager {

  private autoLauncher: AutoLaunchInstance | null = null;
  private config: AutoLaunchConfig;
  private initialized = false;

  /**
   * Creates an instance of AutoLaunchManager.
   *
   * @param {Partial<AutoLaunchConfig>} [config] - Optional configuration overrides.
   */
  constructor(config?: Partial<AutoLaunchConfig>) {
    this.config = {
      name: config?.name || 'MemoFlow',
      isHidden: config?.isHidden ?? true,
    };
  }

  /**
   * Initializes the manager.
   * Dynamically loads the `auto-launch` module for non-macOS platforms.
   *
   * @returns {Promise<void>}
   */
  async init(): Promise<void> {
    // macOS uses native API
    if (process.platform === 'darwin') {
      this.initialized = true;
      return;
    }

    // Windows/Linux use auto-launch - dynamic import
    if (!AutoLaunchClass) {
      try {
        const autoLaunchModule = (await import('auto-launch')) as { default?: AutoLaunchConstructor } & AutoLaunchConstructor;
        AutoLaunchClass = autoLaunchModule.default ?? autoLaunchModule;
      } catch (error) {
        console.warn('[AutoLaunchManager] auto-launch module not available:', error);
        this.initialized = true;
        return;
      }
    }

    try {
      this.autoLauncher = new AutoLaunchClass({
        name: this.config.name,
        path: app.getPath('exe'),
        isHidden: this.config.isHidden,
      });
      this.initialized = true;
    } catch (error) {
      console.warn('[AutoLaunchManager] Failed to create AutoLaunch instance:', error);
      this.initialized = true;
    }
  }

  /**
   * Checks if auto-launch is currently enabled.
   *
   * @returns {Promise<boolean>} True if enabled, false otherwise.
   */
  async isEnabled(): Promise<boolean> {
    if (process.platform === 'darwin') {
      const settings = app.getLoginItemSettings();
      return settings.openAtLogin;
    }

    if (!this.autoLauncher) {
      return false;
    }

    try {
      return await this.autoLauncher.isEnabled();
    } catch (error) {
      console.error('[AutoLaunchManager] Error checking status:', error);
      return false;
    }
  }

  /**
   * Enables auto-launch.
   *
   * @returns {Promise<boolean>} True if successfully enabled, false otherwise.
   */
  async enable(): Promise<boolean> {
    if (process.platform === 'darwin') {
      app.setLoginItemSettings({
        openAtLogin: true,
      });
      return true;
    }

    if (!this.autoLauncher) {
      return false;
    }

    try {
      await this.autoLauncher.enable();
      console.log('[AutoLaunchManager] Auto-launch enabled');
      return true;
    } catch (error) {
      console.error('[AutoLaunchManager] Error enabling:', error);
      return false;
    }
  }

  /**
   * Disables auto-launch.
   *
   * @returns {Promise<boolean>} True if successfully disabled, false otherwise.
   */
  async disable(): Promise<boolean> {
    if (process.platform === 'darwin') {
      app.setLoginItemSettings({
        openAtLogin: false,
      });
      return true;
    }

    if (!this.autoLauncher) {
      return false;
    }

    try {
      await this.autoLauncher.disable();
      console.log('[AutoLaunchManager] Auto-launch disabled');
      return true;
    } catch (error) {
      console.error('[AutoLaunchManager] Error disabling:', error);
      return false;
    }
  }

  /**
   * Toggles the auto-launch state.
   *
   * @returns {Promise<boolean>} True if enabled after toggle, false if disabled (approximated, returns operation result).
   */
  async toggle(): Promise<boolean> {
    const isEnabled = await this.isEnabled();
    if (isEnabled) {
      return this.disable();
    } else {
      return this.enable();
    }
  }

  /**
   * Updates the "start hidden" configuration.
   *
   * @param {boolean} isHidden - Whether to start the application hidden.
   */
  setHidden(isHidden: boolean): void {
    this.config.isHidden = isHidden;
  }
}

export default AutoLaunchManager;
