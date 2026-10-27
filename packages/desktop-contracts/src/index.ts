/**
 * Electron Module Contract
 *
 * Defines the interface for self-contained Electron main process modules.
 * Each business module implements this to perform its own Composition Root.
 *
 * @module @memoflow/desktop-contracts
 *
 * P1 S3（Issue #633）自 @memoflow/contracts 的 electron 子路径提取：桌面平台
 * 纯契约（渠道常量、桌面功能 Schema、宿主 Port 接口）真身迁至本包，本包为
 * 唯一权威定义。运行时中间件 authenticated-ipc 不在本包（见 P1 S4 的
 * host-runtime）。#630 §4.11 结算了 profile-import 与 data-portability 的所有权
 * 纠缠：桌面包装 Schema 归本包，领域 Schema 归 data-portability-contracts，
 * 依赖单向本包 → data-portability-contracts。
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
export * from './ipc-channels';
export type {
  DesktopNotificationPreference,
  DesktopNotificationPreferencePatch,
} from './device-notification-preference';
export {
  DesktopNotificationPreferenceSchema,
  DesktopNotificationPreferencePatchSchema,
} from './device-notification-preference';
export {
  DesktopInstallationOwnerSchema,
  DesktopUpdateCapabilitiesSchema,
  DesktopUpdateChannelSchema,
  DesktopUpdateDisableReasonSchema,
  DesktopUpdateFailureCodeSchema,
  DesktopUpdateFailureSchema,
  DesktopUpdateInstallAuthoritySchema,
  DesktopUpdateIntentSchema,
  DesktopUpdateOperationSchema,
  DesktopUpdateOutcomeSchema,
  DesktopUpdateProgressSchema,
  DesktopUpdateReleaseSchema,
  DesktopUpdateSnapshotSchema,
  DesktopUpdateStateSchema,
  type DesktopInstallationOwnerDTO,
  type DesktopUpdateCapabilitiesDTO,
  type DesktopUpdateChannelDTO,
  type DesktopUpdateDisableReasonDTO,
  type DesktopUpdateFailureCodeDTO,
  type DesktopUpdateFailureDTO,
  type DesktopUpdateInstallAuthorityDTO,
  type DesktopUpdateIntentDTO,
  type DesktopUpdateOperationDTO,
  type DesktopUpdateOutcomeDTO,
  type DesktopUpdateProgressDTO,
  type DesktopUpdateReleaseDTO,
  type DesktopUpdateSnapshotDTO,
  type DesktopUpdateStateDTO,
  DesktopUpdateFeedClassSchema,
  DesktopUpdateDiagnosticsStateSchema,
  DesktopUpdateDiagnosticsFailureSchema,
  DesktopUpdateInstallReceiptStatusSchema,
  DesktopUpdateDiagnosticsSchema,
  type DesktopUpdateFeedClassDTO,
  type DesktopUpdateDiagnosticsStateDTO,
  type DesktopUpdateDiagnosticsFailureDTO,
  type DesktopUpdateInstallReceiptStatusDTO,
  type DesktopUpdateDiagnosticsDTO,
} from './desktop-update';
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

export {
  ProfileIdSchema,
  ProfilePinSchema,
  SelectProfileRequestSchema,
  RemoveProfileRequestSchema,
  CreateGuestProfileRequestSchema,
  RenameProfileRequestSchema,
} from './profile-access';
export type { CreateGuestProfileRequest, RenameProfileRequest } from './profile-access';

// Device-local keyboard bindings (Issue #630 §4.9 / Q5). Owner: desktop platform
// contracts — the setting surfaces only consume and persist them.
export {
  keyboardCommandIds,
  DeviceKeymapSchema,
  DeviceKeymapWriteSchema,
  DeviceKeymapSnapshotSchema,
  type KeyboardCommandId,
  type DeviceKeymap,
} from './keyboard-keymap';
export * from './profile-import';
