/**
 * Notification Service
 *
 * Manages native desktop notifications using Electron's Notification API.
 * Handles system tray notifications, sounds, and interaction events.
 * Includes support for "Do Not Disturb" (DND) mode and scheduling.
 *
 * @module services/notification
 */

import { Notification, nativeImage, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTypedEventSubscriber, eventBus } from '@memoflow/utils/domain';
import { createLogger } from '@memoflow/utils/logger';
import type { SettingEventMap } from '@memoflow/contracts/setting';
import { CustomNotificationManager } from './custom-notification.manager';
import type { WindowManager } from '../lifecycle/window-manager';
import { resolveAssetPath, resolveAssetPathFromKey } from '../utils/asset-path';
import { assetManifest, type AssetImageKey } from '@memoflow/assets';
import { RendererEventChannels } from '@memoflow/contracts/electron';

const logger = createLogger('NotificationService');
type NotificationServiceEventMap = Pick<
  SettingEventMap,
  'setting:user-setting-patched' | 'setting:user-setting-reset'
>;

const notificationServiceEvents = createTypedEventSubscriber<NotificationServiceEventMap>(eventBus);

/**
 * Configuration options for displaying a notification.
 */
export interface NotificationOptions {
  /** The title of the notification. */
  title: string;
  /** The body text of the notification. */
  body: string;
  /** Path to a custom icon. */
  icon?: string;
  /** Whether to play a sound. */
  sound?: boolean;
  /** The urgency level of the notification. */
  urgency?: 'normal' | 'critical' | 'low';
  /** Whether the notification should be silent. Overrides `sound` if true. */
  silent?: boolean;
  /** Arbitrary data payload to attach to the notification (useful for click handling). */
  data?: Record<string, unknown>;
}

/**
 * Service class for managing application notifications.
 * Implements the Singleton pattern.
 */
export class NotificationService {
  private mainWindow: BrowserWindow | null = null;
  private defaultIcon: Electron.NativeImage | null = null;

  // Do Not Disturb (DND) state
  private dndEnabled: boolean = false;
  private dndStartHour: number = 22; // Default: Starts at 22:00
  private dndEndHour: number = 7; // Default: Ends at 07:00
  private dndScheduleEnabled: boolean = false;

  // Custom Notification Setting
  private useCustomNotification: boolean = true; // Default to custom for now

  constructor(private readonly customNotificationManager: CustomNotificationManager) {
    this.initDefaultIcon();
    this.initEventListeners();
  }

  /**
   * Sets the main window reference.
   * Required for sending IPC messages back to the renderer process upon notification interaction.
   *
   * @param {BrowserWindow} window - The main application window.
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Sets whether to use custom notifications or native ones.
   */
  setUseCustomNotification(useCustom: boolean): void {
    this.useCustomNotification = useCustom;
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

  /**
   * Initializes the default application icon for notifications.
   */
  private initDefaultIcon(): void {
    try {
      const iconPath =
        resolveAssetPathFromKey('images', 'logo128', assetManifest) ??
        resolveAssetPath('images/logos/MemoFlow-128.png');
      this.defaultIcon = nativeImage.createFromPath(iconPath);
    } catch (err) {
      console.warn('[NotificationService] Failed to load default icon:', err);
    }
  }

  /**
   * Initializes internal event listeners for system events (reminders, schedules).
   */
  private initEventListeners(): void {
    // Listen for setting changes to dynamically update notification style preference
    notificationServiceEvents.on('setting:user-setting-patched', (eventData) => {
      if (eventData.category === 'notification' && 'useCustomNotification' in eventData.changes) {
        this.useCustomNotification = Boolean(eventData.changes.useCustomNotification);
        console.log(
          `[NotificationService] Updated useCustomNotification preference to: ${this.useCustomNotification}`,
        );
      }
    });

    notificationServiceEvents.on('setting:user-setting-reset', (eventData) => {
      if (!eventData.category || eventData.category === 'notification') {
        this.useCustomNotification = true;
      }
    });
  }

  /**
   * Displays a system notification.
   *
   * @param {NotificationOptions} options - The notification options.
   * @returns {Notification | null} The Notification instance, or null if suppressed/unsupported.
   */
  showNotification(options: NotificationOptions): Notification | null {
    logger.info('[Desktop][NotificationFlow] showNotification invoked', {
      title: options.title,
      bodyLength: options.body?.length ?? 0,
      useCustomNotification: this.useCustomNotification,
      dndEnabled: this.dndEnabled,
      dndScheduleEnabled: this.dndScheduleEnabled,
    });

    // Check DND status
    if (this.isInDNDPeriod()) {
      console.log('[NotificationService] Notification suppressed (DND mode):', options.title);
      // Log notification but do not show, optionally inform renderer of suppression
      if (this.mainWindow) {
        this.mainWindow.webContents.send('notification:suppressed', {
          title: options.title,
          body: options.body,
          data: options.data,
        });
      }
      return null;
    }

    return this.renderNotification(options).notification;
  }

  /**
   * Render a delivery that has already passed canonical Notification policy.
   * DND/QuietHours MUST NOT be re-evaluated here; this method owns device
   * presentation only (MemoFlow custom window vs OS-native notification).
   */
  showCanonicalDelivery(options: NotificationOptions): boolean {
    return this.renderNotification(options).rendered;
  }

  private renderNotification(options: NotificationOptions): {
    rendered: boolean;
    notification: Notification | null;
  } {
    // Device presentation is intentionally separate from Notification policy.
    // The durable Notification runtime has already evaluated QuietHours/DND.
    if (this.useCustomNotification) {
      logger.info('[Desktop][NotificationFlow] Routing notification to custom manager', {
        title: options.title,
      });
      this.customNotificationManager.dispatch(options);
      return { rendered: true, notification: null };
    }

    logger.info('[Desktop][NotificationFlow] Routing notification to native Electron notification', {
      title: options.title,
    });
    if (!Notification.isSupported()) {
      console.warn('[NotificationService] Notifications are not supported on this system');
      return { rendered: false, notification: null };
    }

    const notification = new Notification({
      title: options.title,
      body: options.body,
      icon: options.icon
        ? nativeImage.createFromPath(this.resolveNotificationIconPath(options.icon))
        : (this.defaultIcon ?? undefined),
      silent: options.silent ?? !options.sound,
      urgency: options.urgency ?? 'normal',
    });

    notification.on('click', () => {
      this.handleNotificationClick(options.data);
    });
    notification.on('close', () => {
      console.log('[NotificationService] Notification closed:', options.title);
    });

    notification.show();
    return { rendered: true, notification };
  }

  /**
   * Handles user click on a notification.
   * Restores focus to the main window and sends a navigation event to the renderer.
   *
   * @param {Record<string, unknown>} [data] - The data payload associated with the notification.
   */
  private handleNotificationClick(data?: Record<string, unknown>): void {
    // Focus main window
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.focus();

      // Send IPC message to renderer
      if (data) {
        this.mainWindow.webContents.send(RendererEventChannels.NOTIFICATION_CLICKED, data);
      }
    }
  }

  private resolveNotificationIconPath(icon: string): string {
    const manifestMatch = resolveAssetPathFromKey('images', icon as AssetImageKey, assetManifest);

    if (manifestMatch) {
      return manifestMatch;
    }

    if (icon.startsWith('file://')) {
      return fileURLToPath(new URL(icon));
    }

    if (path.isAbsolute(icon)) {
      return icon;
    }

    if (icon.startsWith('images/') || icon.startsWith('audio/') || icon.startsWith('fonts/')) {
      return resolveAssetPath(icon);
    }

    return icon;
  }

  /**
   * Handles custom actions on notifications (if implemented).
   *
   * @param {string} actionType - The type of action performed.
   * @param {Record<string, unknown>} [data] - Associated data.
   */
  private handleNotificationAction(actionType: string, data?: Record<string, unknown>): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('notification:action', {
        actionType,
        data,
      });
    }
  }

  /**
   * Helper to show a reminder notification.
   *
   * @param {Object} reminder - Reminder details.
   * @returns {Notification | null} The notification instance.
   */
  showReminderNotification(reminder: {
    id: string;
    title: string;
    body?: string;
    importance?: string;
  }): Notification | null {
    const urgency =
      reminder.importance === 'vital' || reminder.importance === 'important'
        ? ('critical' as const)
        : ('normal' as const);

    return this.showNotification({
      title: `🔔 ${reminder.title}`,
      body: reminder.body || '',
      urgency,
      sound: true,
      data: {
        type: 'reminder',
        id: reminder.id,
      },
    });
  }

  /**
   * Helper to show a schedule notification.
   *
   * @param {Object} task - Schedule task details.
   * @returns {Notification | null} The notification instance.
   */
  showScheduleNotification(task: {
    id: string;
    name: string;
    description?: string;
  }): Notification | null {
    return this.showNotification({
      title: `📅 ${task.name}`,
      body: task.description || '调度任务已触发',
      sound: true,
      data: {
        type: 'schedule',
        id: task.id,
      },
    });
  }

  /**
   * Helper to show a goal progress notification.
   *
   * @param {Object} goal - Goal progress details.
   * @returns {Notification | null} The notification instance.
   */
  showGoalProgressNotification(goal: {
    id: string;
    title: string;
    progress: number;
    targetValue: number;
  }): Notification | null {
    const percentage = Math.round((goal.progress / goal.targetValue) * 100);
    return this.showNotification({
      title: `🎯 目标进度更新`,
      body: `${goal.title}: ${percentage}% (${goal.progress}/${goal.targetValue})`,
      data: {
        type: 'goal',
        id: goal.id,
      },
    });
  }

  /**
   * Helper to show a task completion notification.
   *
   * @param {Object} task - Completed task details.
   * @returns {Notification | null} The notification instance.
   */
  showTaskCompletedNotification(task: { id: string; title: string }): Notification | null {
    return this.showNotification({
      title: `✅ 任务已完成`,
      body: task.title,
      data: {
        type: 'task',
        id: task.id,
      },
    });
  }
}

/**
 * Initializes the notification service with the main window.
 *
 * @param {BrowserWindow} mainWindow - The main application window.
 * @returns {NotificationService} The initialized service instance.
 */
export function initNotificationService(mainWindow: BrowserWindow, windowManager: WindowManager): NotificationService {
  const customManager = new CustomNotificationManager(windowManager);
  const service = new NotificationService(customManager);
  service.setMainWindow(mainWindow);
  return service;
}
