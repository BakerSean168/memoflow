/**
 * Electron Module Contract
 *
 * Defines the interface for self-contained Electron main process modules.
 * Each business module implements this to perform its own Composition Root.
 *
 * @module contracts/electron
 */

export type { IElectronAuthContext, ElectronAuthResolutionCode } from './auth-context';
export {
  InterventionWindowCommandSchema,
  type InterventionWindowCommand,
  type InterventionWindowProjection,
  type InterventionWindowState,
} from './intervention-window';
export {
  FocusWindowCommandSchema,
  type FocusWindowCommand,
  type FocusWindowProjection,
  type FocusWindowPhaseKind,
  type FocusWindowSessionState,
} from './focus-window';
export type {
  ProfileKind,
  ProfileUnlockState,
  ProfileCloudState,
  ProfileSummary,
  DesktopAccessSnapshot,
  SelectProfileRequest,
  RemoveProfileRequest,
} from './profile-access';
export { ElectronAuthResolutionError, isElectronAuthResolutionError } from './auth-context';
export {
  createAuthenticatedIpcWrapper,
  createAuthenticatedIdentityIpcWrapper,
  withAuthenticatedValue,
  withAuthenticatedIdentity,
  type AuthenticatedIpcWrapperOptions,
  type AuthenticatedIdentityIpcWrapperOptions,
} from './authenticated-ipc';
export * from './ipc-channels';
export type {
  DesktopNotificationPreference,
  DesktopNotificationPreferencePatch,
} from './device-notification-preference';
export {
  DesktopNotificationPreferenceSchema,
  DesktopNotificationPreferencePatchSchema,
} from './device-notification-preference';
export { AIStreamChannels } from './ipc-channels';
export type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from './database';
import type { IElectronAuthContext } from './auth-context';
import type { IElectronDatabase } from './database';

/**
 * Shared context provided to every Electron module during registration.
 */
export interface IElectronModuleContext {
  /** The canonical PowerSync-backed desktop business database runtime. */
  readonly db: IElectronDatabase;
  /** Shared authenticated desktop session context. */
  readonly auth: IElectronAuthContext;
}

/**
 * A self-contained Electron main-process module.
 */
export interface IElectronModule {
  /** Human-readable module name (used in logs). */
  readonly name: string;

  /**
   * Composition Root — wire up repositories, domain services,
   * application services, and IPC handlers.
   */
  register(context: IElectronModuleContext): Promise<void> | void;

  /**
   * Graceful shutdown — release resources, remove IPC handlers, etc.
   */
  destroy?(): Promise<void> | void;
}
