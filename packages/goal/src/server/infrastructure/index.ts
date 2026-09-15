/**
 * Goal Module - Infrastructure Server
 * 目标模块 - 服务端基础设施层
 *
 * Repository implementations for Goal domain.
 * 目标领域的仓储实现。
 *
 * 遵循 Governance 模块架构：
 * - 此层只包含仓储实现、映射器、端口定义
 * - 宿主装配（组合根）由 apps 的 runtime composer 完成（apps/api 与
 *   apps/desktop/src/main/runtime）；api/electron module 只做 transport + lifecycle。
 */

// ============ Composition Root ============
export {
  createGoalModule,
  createGoalUseCases,
  normalizeGoalRuntimeContributions,
  type GoalModuleDependencies,
  type GoalModuleInstance,
  type GoalModuleRuntimeContribution,
  type GoalModuleUseCases,
  type GoalRuntimeContributionsInput,
} from './goal.module';
export type { GoalApplicationPort } from '../application';

// ============ Repository Ports referenced by GoalRepositorySet ============
export type { IGoalRecordRepository, IGoalRepository, IWalletRepository } from '../domain';
export type { GoalWriteTransactionRunner } from '../application/use-cases/commands/goal-write-support';
export type { IHabitRepository } from '../application/use-cases/commands/habit.use-cases';

export {
  createGoalPrismaModule,
  createGoalPrismaRepositories,
  createGoalTaskProgressPrismaHandler,
  createGoalPrismaDeletionTransactionRunner,
  createGoalPrismaScheduleProjectionSource,
  createGoalPrismaReminderFireHandler,
  type GoalRepositorySet,
  type PrismaGoalRelationCleanupFactory,
} from './prisma';
export {
  createGoalRuntimeContribution,
  createGoalEventListenersRuntime,
  type GoalEventListenersRuntime,
} from './runtime';
export {
  createGoalPowerSyncModule,
  createGoalPowerSyncRepositories,
  createGoalTaskProgressPowerSyncHandler,
  createGoalPowerSyncDeletionTransactionRunner,
  createGoalPowerSyncScheduleProjectionSource,
  createGoalPowerSyncReminderFireHandler,
  type PowerSyncGoalRelationCleanupFactory,
} from './powersync';
export {
  createGoalReminderFireHandler,
  GOAL_REMINDER_NOTIFICATION_SOURCE,
  GOAL_REMINDER_WORKFLOW_KEY,
  GoalReminderFirePayloadSchema,
  buildGoalReminderOperationId,
  type CreateGoalReminderFireHandlerDeps,
  type GoalReminderFirePayload,
} from './goal-reminder-fire.handler';
export {
  createGoalScheduleProjectionEventHandlers,
  createGoalScheduleProjectionSource,
  goalScheduleProjectionEventNames,
  GOAL_REMINDER_HANDLER_KEY,
  GOAL_REMINDER_PAYLOAD_VERSION,
  type GoalReminderScheduledPayload,
  type GoalScheduleProjectionEventMap,
  type GoalScheduleProjectionHandlers,
  type GoalScheduleProjectionPlan,
  type GoalScheduleProjectionSource,
} from './schedule-projection-source';
