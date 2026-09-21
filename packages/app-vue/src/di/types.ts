/**
 * DI Type Definitions
 *
 * 定义 app-vue 注入键所使用的服务接口类型。
 *
 * 策略：
 *
 * 1. Goal / Task / AI 使用各模块显式导出的 `*ClientPort` public interface，
 *    避免引用具体 service class 触发 private nominal typing。
 * 2. client seam 的类型解析走依赖包 `dist/*.d.ts`，避免 app-vue 的 d.ts 生成
 *    追踪到外部源码目录并触发 `rootDir: "./src"` 违规。
 */

import type { AccountClientPort } from '@memoflow/account/client';
import type {
  AIClientPort,
  AssistantRuntimeClient,
  RuntimeUsageClient,
  WorkflowRuntimeClient,
} from '@memoflow/ai/client';
import type { CloudAuthClientPort } from '@memoflow/contracts';
import type { GovernanceClientPort } from '@memoflow/governance/client';
import type { GoalClientPort } from '@memoflow/goal/client';
import type { LabelClientPort } from '@memoflow/label/client';
import type { NotificationClientPort } from '@memoflow/notification/client';
import type { RepositoryClientPort } from '@memoflow/repository/client';
import type { RoutineClientPort } from '@memoflow/reminder/client';
import type { ScheduleClientPort } from '@memoflow/schedule/client';
import type { SettingClientPort } from '@memoflow/setting/client';
import type { TaskClientPort } from '@memoflow/task/client';
import type { DataPortabilityClientPort } from '@memoflow/data-portability/client';
import type { Component } from 'vue';

// ── Service Interfaces (structural, no private members) ──
// Residual 927: I*Service = *ClientPort intentional DI facade keep-boundary
// (InjectionKey naming surface; not a second interface body dual to force-merge).

export type IAccountService = AccountClientPort;
export type IAuthService = CloudAuthClientPort;
export type IGoalService = GoalClientPort;
export type ILabelService = LabelClientPort;
export type ITaskService = TaskClientPort;
export type IScheduleService = ScheduleClientPort;
export type IRepositoryService = RepositoryClientPort;
export type IRoutineService = RoutineClientPort;
export type INotificationService = NotificationClientPort;
export type ISettingService = SettingClientPort;
export type IDataPortabilityService = DataPortabilityClientPort;
export type IAIClient = AIClientPort;
/** Mastra-native open-chat execution/history seam; separate from the legacy AI facade. */
export type IAssistantRuntimeService = AssistantRuntimeClient;
/** Durable cross-runtime token/cost projection by conversation or workflow run. */
export type IRuntimeUsageService = RuntimeUsageClient;
/** Mastra-native durable Workflow seam for goal/task/knowledge product workflows. */
export type IWorkflowRuntimeService = WorkflowRuntimeClient;
export type IRuleService = GovernanceClientPort;

// ── Module Capsules (UI Redesign V2 shell) ──
/**
 * A top-level business module surfaced as a capsule in the V2 shell's
 * WindowHeader. Clicking a capsule opens (or activates) that module's
 * business panel tab.
 *
 * Replaced the grouped `NavigationItem` sidebar model of the V1 shell
 * (removed with `MainLayout.vue` in the S1 switch commit). Hosts override
 * via `MODULE_CAPSULES_KEY` to add/remove/reorder capsules.
 *
 * @see docs/UI_REDESIGN_V2_PLAN.md §2.1, §5
 */
export interface ModuleCapsule {
  /** Stable module id, e.g. 'goal' | 'task' | 'note' | 'schedule' | 'notification'. */
  id: string;
  /** i18n key for the capsule label (e.g. 'nav.capsule.goal'). */
  title: string;
  /** Icon component (@lucide/vue). */
  icon: Component;
  /** Landing route opened in the business panel when the capsule is entered. */
  route: string;
  /**
   * Semantic token naming the source of a numeric badge (e.g.
   * 'notification.unread'). Resolved by the shell; unresolved tokens render
   * no badge. S1 wires only the notification unread source.
   */
  badgeSource?: string;
}
