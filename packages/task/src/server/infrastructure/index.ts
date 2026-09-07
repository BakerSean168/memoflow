/**
 * Infrastructure Server Layer - Barrel Export.
 * 基础设施服务端层 - 统一导出。
 *
 * Server-side infrastructure:
 * 服务端基础设施：
 * - Repository implementations (Prisma, PowerSync)
 *   仓储实现（Prisma、PowerSync）
 * - Persistence mappers
 *   持久化映射器
 * - Explicit composition root and runtime assembly
 *   显式组合根与运行时组装
 */

// ============ Composition Root ============
export {
  createTaskModule,
  createTaskUseCases,
  type TaskModuleDependencies,
  type TaskModuleInstance,
  type TaskModuleRuntimeContribution,
  type TaskModuleUseCases,
  type TaskRuntimeContributionsInput,
} from './task.module';
export type { TaskApplicationPort } from '../application';

// ============ Repository Ports referenced by TaskRepositorySet ============
export type {
  ITaskInstanceRepository,
  ITaskTemplateRepository,
} from '../domain/repositories';
export type { TaskWriteTransactionRunner } from '../application/use-cases/commands/task-write-support';

export { PrismaTaskBindingReadPort } from './adapters/prisma/prisma-task-binding-read-port';
export { PowerSyncTaskBindingReadPort } from './adapters/powersync/powersync-task-binding-read-port';
export {
  createTaskPowerSyncModule,
  createTaskPowerSyncRepositories,
  createTaskPowerSyncGoalOutboxRuntime,
  createTaskPowerSyncScheduleProjectionSource,
} from './powersync';
export {
  createTaskPrismaModule,
  createTaskPrismaRepositories,
  createTaskPrismaGoalOutboxRuntime,
  createTaskPrismaScheduleProjectionSource,
  type CreateTaskPrismaModuleOptions,
  type TaskRepositorySet,
} from './prisma';
export { createTaskRuntimeContribution } from './runtime';
export {
  normalizeTaskRuntimeContributions,
} from './normalize-runtime-contributions';
export {
  createTaskGoalOutboxRuntime,
  type TaskGoalOutboxRuntimeOptions,
} from './task-goal-outbox-runtime';
export {
  createTaskScheduleProjectionSource,
  createTaskScheduleProjectionEventHandlers,
  taskScheduleProjectionEventNames,
  TASK_REMINDER_HANDLER_KEY,
  TASK_REMINDER_PAYLOAD_VERSION,
  type TaskScheduleProjectionEventMap,
  type TaskScheduleProjectionHandlers,
  type TaskScheduleProjectionPlan,
  type TaskScheduleProjectionSource,
  type TaskReminderScheduledPayload,
} from './schedule-projection-source';
export {
  createTaskReminderScheduledHandlerRegistration,
  buildTaskReminderOperationId,
  TaskReminderScheduledPayloadSchema,
  TASK_REMINDER_BUSINESS_SOURCE,
  TASK_REMINDER_WORKFLOW_KEY,
  type CreateTaskReminderScheduledHandlerRegistrationDeps,
  type TaskReminderSkipReason,
} from './task-reminder-fire.handler';
