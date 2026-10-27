import type { AccountEventMap } from '../modules/account/protocol/account-event-map';
import type { AccountRpcMap } from '../modules/account/protocol/account-rpc-map';
import type { AIEventMap } from '../modules/ai/protocol/ai-event-map';
import type { AIRpcMap } from '../modules/ai/protocol/ai-rpc-map';
import type { DataPortabilityRpcMap } from '@memoflow/data-portability-contracts';
import type { GoalEventMap } from '@memoflow/goal-contracts';
import type { GoalRpcMap } from '@memoflow/goal-contracts';
import type { NotificationEventMap } from '@memoflow/notification-contracts';
import type { NotificationRpcMap } from '@memoflow/notification-contracts';
import type { RepositoryEventMap } from '@memoflow/repository-contracts';
import type { RepositoryRpcMap } from '@memoflow/repository-contracts';
import type { RoutineScheduleProjectionEventMap } from '@memoflow/routine-contracts';
import type { ScheduleEventMap } from '@memoflow/schedule-contracts';
import type { ScheduleRpcMap } from '@memoflow/schedule-contracts';
import type { SettingEventMap } from '@memoflow/setting-contracts';
import type { SettingRpcMap } from '@memoflow/setting-contracts';
import type { TaskEventMap, TaskRpcMap } from '@memoflow/task-contracts';

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
  NotificationEventMap &
  RepositoryEventMap &
  RoutineScheduleProjectionEventMap &
  ScheduleEventMap &
  SettingEventMap &
  TaskEventMap & { 'system:ready': void; 'system:error': Error }; // 也可以加一些全局通用的

export type AppEventRegistry = CoreAppEventRegistry & AppEventRegistryExtensions;

// 2. 组装全局 RPC 表 (Global RPC Registry)
type CoreAppRpcRegistry = AccountRpcMap &
  AIRpcMap &
  DataPortabilityRpcMap &
  GoalRpcMap &
  NotificationRpcMap &
  RepositoryRpcMap &
  ScheduleRpcMap &
  SettingRpcMap &
  TaskRpcMap;

export type AppRpcRegistry = CoreAppRpcRegistry & AppRpcRegistryExtensions;
