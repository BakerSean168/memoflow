import type { DesktopPresentationResult } from '@memoflow/notification-contracts';
import { CustomNotificationManager } from './custom-notification.manager';
import type { WindowManager } from '../lifecycle/window-manager';

import type { NotificationConfig } from '../capabilities/ports';

export type NotificationOptions = NotificationConfig;

export class NotificationService {
  private dndEnabled = false;
  private dndStartHour = 22;
  private dndEndHour = 7;
  private dndScheduleEnabled = false;

  constructor(private readonly customNotificationManager: CustomNotificationManager) {}

  clearPresentation(): void {
    this.customNotificationManager.clearPresentation();
  }

  destroy(): void {
    this.customNotificationManager.destroy();
  }

  // ===== Do Not Disturb Methods =====

  /**
   * Manually enables Do Not Disturb mode.
   * Suppresses all non-critical notifications.
   */
  enableDND(): void {
    this.dndEnabled = true;
    console.log('[NotificationService] DND mode enabled');
  }

  /**
   * Manually disables Do Not Disturb mode.
   */
  disableDND(): void {
    this.dndEnabled = false;
    console.log('[NotificationService] DND mode disabled');
  }

  /**
   * Toggles the state of Do Not Disturb mode.
   *
   * @returns {boolean} The new state of DND mode (true = enabled).
   */
  toggleDND(): boolean {
    this.dndEnabled = !this.dndEnabled;
    console.log(`[NotificationService] DND mode ${this.dndEnabled ? 'enabled' : 'disabled'}`);
    return this.dndEnabled;
  }

  /**
   * Checks if Do Not Disturb mode is manually enabled.
   *
   * @returns {boolean} True if DND is manually enabled.
   */
  isDNDEnabled(): boolean {
    return this.dndEnabled;
  }

  /**
   * Configures the automatic schedule for Do Not Disturb mode.
   *
   * @param {number} startHour - The hour (0-23) to start DND.
   * @param {number} endHour - The hour (0-23) to end DND.
   */
  setDNDSchedule(startHour: number, endHour: number): void {
    this.dndStartHour = startHour;
    this.dndEndHour = endHour;
    this.dndScheduleEnabled = true;
    console.log(`[NotificationService] DND schedule set: ${startHour}:00 - ${endHour}:00`);
  }

  /**
   * Disables the automatic DND schedule.
   */
  disableDNDSchedule(): void {
    this.dndScheduleEnabled = false;
    console.log('[NotificationService] DND schedule disabled');
  }

  /**
   * Retrieves the current DND configuration.
   *
   * @returns {Object} The current DND settings.
   */
  getDNDConfig(): {
    enabled: boolean;
    scheduleEnabled: boolean;
    startHour: number;
    endHour: number;
  } {
    return {
      enabled: this.dndEnabled,
      scheduleEnabled: this.dndScheduleEnabled,
      startHour: this.dndStartHour,
      endHour: this.dndEndHour,
    };
  }

  /**
   * Checks if the application is currently in a DND period (either manual or scheduled).
   *
   * @returns {boolean} True if notifications should be suppressed.
   */
  private isInDNDPeriod(): boolean {
    if (this.dndEnabled) {
      return true;
    }

    if (!this.dndScheduleEnabled) {
      return false;
    }

    const now = new Date();
    const currentHour = now.getHours();

    // Handle overnight schedules (e.g., 22:00 - 07:00)
    if (this.dndStartHour > this.dndEndHour) {
      return currentHour >= this.dndStartHour || currentHour < this.dndEndHour;
    }

    // Handle same-day schedules (e.g., 14:00 - 16:00)
    return currentHour >= this.dndStartHour && currentHour < this.dndEndHour;
  }

  /** Delivery policy runs upstream; device DND and the renderer acknowledgement stay local. */
  async showCanonicalDelivery(options: NotificationOptions): Promise<DesktopPresentationResult> {
    if (this.isInDNDPeriod()) return { status: 'suppressed', reason: 'device-dnd' };
    return this.customNotificationManager.dispatch(options);
  }
}

export function initNotificationService(windowManager: WindowManager): NotificationService {
  return new NotificationService(new CustomNotificationManager(windowManager));
}
