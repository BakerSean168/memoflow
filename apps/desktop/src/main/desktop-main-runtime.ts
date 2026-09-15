/**
 * DesktopMainRuntime — explicit owner of process-level dependencies.
 *
 * Replaces module-level `let runtimeManager` with a single object that
 * owns all long-lived desktop main-process dependencies:
 *   - WindowManager (window lifecycle)
 *   - DesktopProfileRuntimeManager (profile lifecycle)
 *   - NotificationService (desktop notifications)
 *
 * Created once at module load in main.ts and passed to all consumers.
 *
 * @module desktop-main-runtime
 */

import type { DesktopProfileRuntimeManager } from './profile';
import type { WindowManager } from './lifecycle/window-manager';
import type { NotificationPort, ExternalEditorPort } from './capabilities/ports';
import type { DesktopFeaturesRuntime } from './desktop-features';
import { createLogger } from '@memoflow/utils/logger';
import type { DeviceAuthCoordinator } from './profile/device-auth-coordinator';

const logger = createLogger('DesktopMainRuntime');

export class DesktopMainRuntime {
  private _notification: NotificationPort | null = null;
  private _desktopFeaturesRuntime: DesktopFeaturesRuntime | null = null;
  private _deviceAuthCoordinator: DeviceAuthCoordinator | null = null;

  constructor(
    readonly windowManager: WindowManager,
    readonly profileRuntimeManager: DesktopProfileRuntimeManager,
  ) {
  }

  /** Get the auth context provider for the active profile (or null). */
  get authContextProvider() {
    return this.profileRuntimeManager.getActiveProfileAccessContext();
  }

  /** Active device notification renderer, or null until desktop capabilities are ready. */
  get notification(): NotificationPort | null {
    return this._notification;
  }

  /** Store the notification capability port for lifecycle management. */
  setNotification(port: NotificationPort | null): void {
    this._notification = port;
  }

  setDesktopFeaturesRuntime(runtime: DesktopFeaturesRuntime): void {
    this._desktopFeaturesRuntime = runtime;
  }

  /**
   * The registry-owned external-editor capability port (null before the
   * CapabilityRegistry initializes or when the capability is degraded).
   *
   * Resolved lazily so consumers may be bound before the capability registry
   * exists; a null result degrades gracefully instead of crashing.
   */
  get externalEditor(): ExternalEditorPort | null {
    return this._desktopFeaturesRuntime?.externalEditor ?? null;
  }

  setDeviceAuthCoordinator(coordinator: DeviceAuthCoordinator): void {
    this._deviceAuthCoordinator = coordinator;
  }

  /**
   * Dispose all owned resources.
   * Called during application shutdown (before-quit).
   *
   * Note: WindowManager cleanup is handled by Electron's window close
   * lifecycle, not here.
   */
  async dispose(): Promise<void> {
    logger.info('Disposing DesktopMainRuntime...');

    this._deviceAuthCoordinator?.dispose();
    this._deviceAuthCoordinator = null;

    // Release profile resources without forgetting which local Profile should reopen next launch.
    try {
      await this.profileRuntimeManager.deactivateProfile({ preserveSelection: true });
    } catch (err) {
      logger.error('Profile deactivation failed during dispose', err);
    }

    if (this._desktopFeaturesRuntime) {
      await this._desktopFeaturesRuntime.destroy();
      this._desktopFeaturesRuntime = null;
    }

    this._notification = null;
    logger.info('DesktopMainRuntime disposed');
  }
}
