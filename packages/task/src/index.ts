/**
 * @memoflow/task
 *
 * Task module runtime root.
 *
 * Public task contracts are centralized in
 * `@memoflow/contracts/task`.
 * Root exports are limited to the canonical server composition root.
 * Client / API / Electron seams use dedicated subpaths.
 * Task-specific analytics, testing, and schedule orchestration seams
 * remain on their dedicated subpaths.
 */

export {
  createTaskModule,
  createTaskPowerSyncModule,
  createTaskPowerSyncRepositories,
  createTaskPrismaModule,
  createTaskPrismaRepositories,
  createTaskRuntimeContribution,
  normalizeTaskRuntimeContributions,
  createTaskPrismaGoalOutboxRuntime,
  createTaskPowerSyncGoalOutboxRuntime,
  PrismaTaskBindingReadPort,
  PowerSyncTaskBindingReadPort,
  type TaskApplicationPort,
  type TaskGoalContextReadPort,
  type TaskModuleDependencies,
  type TaskModuleInstance,
  type TaskModuleRuntimeContribution,
  type TaskModuleUseCases,
  type TaskRuntimeContributionsInput,
  type TaskRepositorySet,
  type CreateTaskPrismaModuleOptions,
  type ITaskPlanRepository,
  type ITaskOccurrenceRepository,
} from './server';
export type { TaskWriteTransactionRunner } from './server/application/use-cases/commands/task-write-support';
