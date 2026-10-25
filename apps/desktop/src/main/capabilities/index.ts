/**
 * Desktop Platform Capabilities
 *
 * Narrow typed ports and Electron-first factories for the five desktop platform
 * capabilities (Tray, Global Shortcut, Auto Launch, Notification, External
 * Editor), plus a {@link CapabilityRegistry} that constructs them and gates
 * degradation so a missing/failed capability degrades the product instead of
 * crashing startup.
 *
 * Consumers depend on the port types (`capabilities/ports`) and on the
 * registry — never on Electron APIs directly.
 *
 * @module capabilities
 */

export type {
  AutoLaunchPort,
  CapabilityId,
  DndConfig,
  ExternalEditorPort,
  NotificationConfig,
  NotificationPort,
  ShortcutConfig,
  ShortcutPort,
  TrayPort,
} from './ports';

export {
  CapabilityRegistry,
  UNAVAILABLE,
  type CapabilityFactory,
  type CapabilityFactoryResult,
} from './capability-registry';

export {
  createElectronAutoLaunchPort,
  createElectronExternalEditorPort,
  createElectronNotificationPort,
  createElectronShortcutPort,
  createElectronTrayPort,
  type AutoLaunchPortOptions,
  type NotificationPortOptions,
} from './electron-factories';
