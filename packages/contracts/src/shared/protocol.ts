import type { AccountEventMap } from '../modules/account/protocol/account-event-map';
import type { AccountRpcMap } from '../modules/account/protocol/account-rpc-map';
import type { AIEventMap } from '../modules/ai/protocol/ai-event-map';
import type { AIRpcMap } from '../modules/ai/protocol/ai-rpc-map';
import type { DataPortabilityRpcMap } from '../modules/data-portability/protocol/data-portability-rpc-map';
import type { GoalEventMap } from '../modules/goal/protocol/goal-event-map';
import type { GoalRpcMap } from '../modules/goal/protocol/goal-rpc-map';
import type { GovernanceEventMap } from '../modules/governance/protocol/governance-event-map';
import type { GovernanceRpcMap } from '../modules/governance/protocol/governance-rpc-map';
import type { NotificationEventMap } from '../modules/notification/protocol/notification-event-map';
import type { NotificationRpcMap } from '../modules/notification/protocol/notification-rpc-map';
import type { RepositoryEventMap } from '../modules/repository/protocol/repository-event-map';
import type { RepositoryRpcMap } from '../modules/repository/protocol/repository-rpc-map';
import type { ScheduleEventMap } from '../modules/schedule/protocol/schedule-event-map';
import type { ScheduleRpcMap } from '../modules/schedule/protocol/schedule-rpc-map';
import type { SettingEventMap } from '../modules/setting/protocol/setting-event-map';
import type { SettingRpcMap } from '../modules/setting/protocol/setting-rpc-map';
import type { TaskEventMap } from '../modules/task/protocol/task-event-map';
import type { TaskRpcMap } from '../modules/task/protocol/task-rpc-map';

/**
 * Event registry extension seam.
 * 事件注册表扩展 seam。
 *
 * Reserved for future out-of-tree protocol extensions.
 * 预留给未来工作区外或实验性协议扩展使用。
 */
export interface AppEventRegistryExtensions extends Record<string, unknown> {}

/**
 * Feature-owned RPC registry extensions.
 * 功能模块自有的 RPC 注册表扩展点。
 */
export interface AppRpcRegistryExtensions extends Record<string, [unknown, unknown]> {}

// 1. 组装全局事件表 (Global Event Registry)
type CoreAppEventRegistry = AccountEventMap &
  AIEventMap &
  GoalEventMap &
  GovernanceEventMap &
  NotificationEventMap &
  RepositoryEventMap &
  ScheduleEventMap &
  SettingEventMap &
  TaskEventMap & { 'system:ready': void; 'system:error': Error }; // 也可以加一些全局通用的

export type AppEventRegistry = CoreAppEventRegistry & AppEventRegistryExtensions;

// 2. 组装全局 RPC 表 (Global RPC Registry)
type CoreAppRpcRegistry = AccountRpcMap &
  AIRpcMap &
  DataPortabilityRpcMap &
  GoalRpcMap &
  GovernanceRpcMap &
  NotificationRpcMap &
  RepositoryRpcMap &
  ScheduleRpcMap &
  SettingRpcMap &
  TaskRpcMap;

export type AppRpcRegistry = CoreAppRpcRegistry & AppRpcRegistryExtensions;


