/**
 * DI Injection Keys
 *
 * 所有共享模块的 Vue InjectionKey 定义。
 * 宿主应用 (web / desktop) 负责 provide 具体的 Service 实例。
 * app-vue 中的 composables 通过 inject(KEY) 获取服务。
 */

import type { InjectionKey, Ref, ShallowRef } from 'vue';
import type { CloudAuthDesktopClientPort } from '@memoflow/contracts';
import type {
  DesktopAccessSnapshot,
  DesktopNotificationPreference,
  DesktopNotificationPreferencePatch,
} from '@memoflow/contracts/electron';
import type { ElectronBridge } from '@memoflow/ipc-client';
import type { AIRuntimeSurface } from '@memoflow/contracts/ai';
import type { Result } from '@memoflow/contracts/result';
import type { DesktopAuthApi } from '../shared/utils/desktop-auth-recovery';
import type {
  IAccountService,
  IAuthService,
  IGoalService,
  ILabelService,
  ITaskService,
  IScheduleService,
  IReminderService,
  IRepositoryService,
  INotificationService,
  ISettingService,
  IDataPortabilityService,
  IAIClient,
  IAssistantRuntimeService,
  IRuntimeUsageService,
  IWorkflowRuntimeService,
  IRuleService,
  IDashboardService,
  ModuleCapsule,
} from './types';

// ── Domain Service Keys ──
export const ACCOUNT_SERVICE_KEY: InjectionKey<IAccountService> = Symbol('AccountService');
export const AUTH_SERVICE_KEY: InjectionKey<IAuthService> = Symbol('AuthService');
export const DESKTOP_CLOUD_AUTH_SERVICE_KEY: InjectionKey<CloudAuthDesktopClientPort> =
  Symbol('DesktopCloudAuthService');
export const GOAL_SERVICE_KEY: InjectionKey<IGoalService> = Symbol('GoalService');
export const LABEL_SERVICE_KEY: InjectionKey<ILabelService> = Symbol('LabelService');
export const TASK_SERVICE_KEY: InjectionKey<ITaskService> = Symbol('TaskService');
export const SCHEDULE_SERVICE_KEY: InjectionKey<IScheduleService> = Symbol('ScheduleService');
export const REMINDER_SERVICE_KEY: InjectionKey<IReminderService> = Symbol('ReminderService');
export const REPOSITORY_SERVICE_KEY: InjectionKey<IRepositoryService> = Symbol('RepositoryService');
export const NOTIFICATION_SERVICE_KEY: InjectionKey<INotificationService> =
  Symbol('NotificationService');
export interface DesktopNotificationDevicePreferencePort {
  get(): Promise<Result<DesktopNotificationPreference>>;
  update(
    patch: DesktopNotificationPreferencePatch,
  ): Promise<Result<DesktopNotificationPreference>>;
  reset(): Promise<Result<DesktopNotificationPreference>>;
}
export const DESKTOP_NOTIFICATION_DEVICE_PREFERENCE_KEY: InjectionKey<DesktopNotificationDevicePreferencePort> =
  Symbol('DesktopNotificationDevicePreference');
export const SETTING_SERVICE_KEY: InjectionKey<ISettingService> = Symbol('SettingService');
export const DATA_PORTABILITY_SERVICE_KEY: InjectionKey<IDataPortabilityService> =
  Symbol('DataPortabilityService');
export const AI_CLIENT_KEY: InjectionKey<IAIClient> = Symbol('AIClient');
export const AI_ASSISTANT_RUNTIME_KEY: InjectionKey<IAssistantRuntimeService> =
  Symbol('AIAssistantRuntime');
export const AI_RUNTIME_USAGE_KEY: InjectionKey<IRuntimeUsageService> = Symbol('AIRuntimeUsage');
export const AI_WORKFLOW_RUNTIME_KEY: InjectionKey<IWorkflowRuntimeService> =
  Symbol('AIWorkflowRuntime');
export const RULE_SERVICE_KEY: InjectionKey<IRuleService> = Symbol('RuleService');
export const DASHBOARD_SERVICE_KEY: InjectionKey<IDashboardService> = Symbol('DashboardService');

// ── UI / Navigation Keys ──
/**
 * V2 shell: ordered list of module capsules rendered in WindowHeader.
 * Hosts may override to add/remove/reorder capsules (Brief §12-4).
 * (Replaced MAIN_NAVIGATION_KEY / BOTTOM_NAVIGATION_KEY of the V1 sidebar.)
 */
export const MODULE_CAPSULES_KEY: InjectionKey<ModuleCapsule[]> = Symbol('ModuleCapsules');
export const USER_NAME_KEY: InjectionKey<string> = Symbol('UserName');
export const LOGOUT_HANDLER_KEY: InjectionKey<() => void> = Symbol('LogoutHandler');
export const PROFILE_LOCK_HANDLER_KEY: InjectionKey<() => Promise<void>> =
  Symbol('ProfileLockHandler');
export const DESKTOP_ACCESS_SNAPSHOT_KEY: InjectionKey<Ref<DesktopAccessSnapshot | null>> =
  Symbol('DesktopAccessSnapshot');

// ── Desktop Platform Keys ──
// Residual 915: DESKTOP_AUTH_API_KEY dual retired — InjectionKey<DesktopAuthApi>
// (no ElectronBridge Pick dual of the sole invoke-api body).
export const DESKTOP_AUTH_API_KEY: InjectionKey<DesktopAuthApi> = Symbol('DesktopAuthApi');

/** Desktop preload bridge — canonical type from @memoflow/ipc-client. */
// Residual 929: ElectronBridge keep-boundary for window controls (invoke+on+off).
export type { ElectronBridge };

export const DESKTOP_BRIDGE_KEY: InjectionKey<ElectronBridge> = Symbol('DesktopBridge');

/** Shell-owned Global Composer teleport mount (HTMLElement). */
export const SHELL_COMPOSER_MOUNT_KEY: InjectionKey<ShallowRef<HTMLElement | null>> =
  Symbol('ShellComposerMount');

/** Shell-owned Global Composer density token. */
export const SHELL_COMPOSER_DENSITY_KEY: InjectionKey<Ref<'comfortable' | 'compact' | 'icon'>> =
  Symbol('ShellComposerDensity');

/** Shell-owned workflow surface teleport mount. */
export const SHELL_WORKFLOW_MOUNT_KEY: InjectionKey<ShallowRef<HTMLElement | null>> =
  Symbol('ShellWorkflowMount');

/**
 * Host-provided Assistant surface tag (ADR-035 / plan §4.2).
 * Web provides `'web'`, Desktop renderer provides `'desktop'`; shared
 * composables read this instead of sniffing `window`. The value travels
 * unchanged on every assistant `message` command so the Host Turn Engine
 * observes the real calling surface.
 *
 * Host 提供的 Assistant surface 标签（ADR-035 / 计划 §4.2）。Web 提供
 * `'web'`，Desktop renderer 提供 `'desktop'`；共享 composable 通过该 key
 * 读取，而不是嗅探 `window`。该值原样出现在每条 assistant `message`
 * command 上，使 Host Turn Engine 观察到真实调用 surface。
 */
export const ASSISTANT_SURFACE_KEY: InjectionKey<AIRuntimeSurface> = Symbol('AIRuntimeSurface');
