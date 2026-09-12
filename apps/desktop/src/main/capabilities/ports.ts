/**
 * Desktop Platform Capability Ports
 *
 * Narrow, host-agnostic ports for the five desktop platform capabilities:
 *   - Tray (TrayPort)
 *   - Global Shortcut (ShortcutPort)
 *   - Auto Launch (AutoLaunchPort)
 *   - Notification (NotificationPort)
 *   - External Editor (ExternalEditorPort)
 *
 * Consumers depend on these port types, never on Electron APIs directly.
 * The Electron-first implementations that satisfy them live in
 * `capabilities/electron-factories.ts` and are constructed through the
 * `CapabilityRegistry` so a failed capability degrades instead of crashing.
 *
 * A port is intentionally narrow: it exposes only what a consumer needs and
 * never leaks Electron runtime objects. Host-provided values (a window, a
 * callback) are passed in by the caller, not acquired by the port.
 *
 * @module capabilities/ports
 */

/**
 * Minimal host window surface a window-binding capability needs.
 *
 * The real window is owned by the composition root (a host value passed in to
 * `setMainWindow`); the port only declares the members it relies on so it stays
 * decoupled from Electron's concrete `BrowserWindow` type.
 */
export interface CapabilityMainWindow {
  isVisible(): boolean;
  show(): void;
  hide(): void;
  focus(): void;
  webContents?: { send(channel: string, ...args: unknown[]): void };
}

/** Shared rendered-shortcut DTO used across the shortcut surface. */
export interface ShortcutConfig {
  /** The unique identifier for the shortcut (e.g., 'show-app'). */
  id: string;
  /** The accelerator string (e.g., 'CommandOrControl+Shift+D'). */
  accelerator: string;
  /** Description of what the shortcut does. */
  description: string;
  /** Whether the shortcut is global (works when app is not focused). */
  global: boolean;
  /** Whether the shortcut is currently enabled. */
  enabled: boolean;
  /** The action to execute when triggered. */
  action: () => void;
}

/** Configuration for rendering a native or custom notification. */
export interface NotificationConfig {
  /** The title of the notification. */
  title: string;
  /** The body text of the notification. */
  body: string;
  /** Optional icon path. */
  icon?: string;
  /** Whether to play a sound. */
  sound?: boolean;
  /** The urgency level of the notification. */
  urgency?: 'normal' | 'critical' | 'low';
  /** Whether the notification should be silent. Overrides `sound` if true. */
  silent?: boolean;
  /** Arbitrary data payload attached to the notification (click handling). */
  data?: Record<string, unknown>;
}

/** Current Do-Not-Disturb configuration, as read by consumers. */
export interface DndConfig {
  enabled: boolean;
  scheduleEnabled: boolean;
  startHour: number;
  endHour: number;
}

/**
 * Tray capability port.
 *
 * The tray owns the system-tray icon lifecycle and flash signalling. Window
 * toggling is internal to the Electron implementation; consumers only drive
 * flashing (notification cues) and teardown.
 */
export interface TrayPort {
  /** Rebind the host window the tray controls (visibility toggling). */
  setWindow(window: CapabilityMainWindow): void;
  /** Start flashing the tray icon to signal a notification. */
  startFlashing(): void;
  /** Stop flashing the tray icon and restore its steady state. */
  stopFlashing(): void;
  /** Tear down the tray icon. Safe to call multiple times. */
  destroy(): void;
}

/**
 * Global shortcut capability port.
 *
 * Register, unregister and inspect global/local application shortcuts. The
 * renderer surfaces the registered list and toggles enablement through this
 * port.
 */
export interface ShortcutPort {
  /** Rebind the host window the default show/hide shortcut toggles. */
  setWindow(window: CapabilityMainWindow): void;
  /** List the currently registered shortcuts (renderer-facing). */
  getShortcuts(): ShortcutConfig[];
  /** Register a shortcut, returning whether registration succeeded. */
  register(config: ShortcutConfig): boolean;
  /** Unregister a shortcut by its accelerator. */
  unregister(accelerator: string): void;
  /** Unregister every managed shortcut (used at shutdown). */
  unregisterAll(): void;
  /** Release all shortcut resources. */
  destroy(): void;
}

/**
 * Auto-launch capability port.
 *
 * Queries and mutates the "launch at login" state. The underlying mechanism is
 * platform-specific (macOS login item vs. registry/desktop entry); the port
 * hides it.
 */
export interface AutoLaunchPort {
  /** Initialize the provider (idempotent; safe to call per composition). */
  init(): Promise<void>;
  /** Whether auto-launch is currently enabled. */
  isEnabled(): Promise<boolean>;
  /** Enable auto-launch. */
  enable(): Promise<boolean>;
  /** Disable auto-launch. */
  disable(): Promise<boolean>;
}

/**
 * Notification capability port.
 *
 * Native/custom desktop notifications, Do-Not-Disturb state, and the typed
 * helper surfaces (reminder/schedule/goal/task). The port returns whether a
 * notification was rendered; callers that need the raw instance cast it.
 */
export interface NotificationPort {
  getDevicePreference(): import('@memoflow/contracts/electron').DesktopNotificationPreference;
  updateDevicePreference(
    patch: import('@memoflow/contracts/electron').DesktopNotificationPreferencePatch,
  ): import('@memoflow/contracts/electron').DesktopNotificationPreference;
  resetDevicePreference(): import('@memoflow/contracts/electron').DesktopNotificationPreference;

  // ===== Do Not Disturb =====
  enableDND(): void;
  disableDND(): void;
  toggleDND(): boolean;
  isDNDEnabled(): boolean;
  setDNDSchedule(startHour: number, endHour: number): void;
  disableDNDSchedule(): void;
  getDNDConfig(): DndConfig;

  /** Show a notification, returning whether one was rendered. */
  show(config: NotificationConfig): boolean;

  /** Typed helpers for domain notification types. */
  showReminder(config: { id: string; title: string; body?: string; importance?: string }): boolean;
  showSchedule(config: { id: string; name: string; description?: string }): boolean;
  showGoalProgress(config: {
    id: string;
    title: string;
    progress: number;
    targetValue: number;
  }): boolean;
  showTaskCompleted(config: { id: string; title: string }): boolean;

  /** Release notification resources at shutdown. */
  destroy(): void;
}

/**
 * External editor capability port.
 *
 * Opens a URI in the platform's registered external editor (Obsidian). The
 * caller builds the `obsidian://` URI; the port only opens it.
 */
export interface ExternalEditorPort {
  /** Open `uri` in the default external handler. */
  openExternal(uri: string): Promise<void>;
}

/** Identifiers for capabilities tracked by the registry. */
export type CapabilityId =
  | 'tray'
  | 'shortcut'
  | 'autolaunch'
  | 'notification'
  | 'external-editor';
