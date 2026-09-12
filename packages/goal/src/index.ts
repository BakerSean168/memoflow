/**
 * @memoflow/goal
 *
 * Goal module runtime root.
 *
 * Public goal contracts are centralized in
 * `@memoflow/contracts/goal`.
 * Root exports are limited to the canonical server composition root.
 * Client / API / Electron seams use dedicated subpaths.
 * Goal-specific analytics, events, and schedule orchestration seams
 * remain on their dedicated subpaths.
 */

export {
  createGoalModule,
  createGoalPrismaModule,
  createGoalPrismaRepositories,
  createGoalTaskProgressPrismaHandler,
  createGoalPrismaDeletionTransactionRunner,
  createGoalPowerSyncModule,
  createGoalPowerSyncRepositories,
  createGoalTaskProgressPowerSyncHandler,
  createGoalPowerSyncDeletionTransactionRunner,
  createGoalRuntimeContribution,
  createGoalEventListenersRuntime,
  createGoalUseCases,
  normalizeGoalRuntimeContributions,
  type GoalApplicationPort,
  type GoalModuleDependencies,
  type GoalModuleInstance,
  type GoalModuleRuntimeContribution,
  type GoalModuleUseCases,
  type GoalRuntimeContributionsInput,
  type GoalRepositorySet,
  type PrismaGoalRelationCleanupFactory,
  type PowerSyncGoalRelationCleanupFactory,
  type GoalEventListenersRuntime,
  type IGoalRepository,
  type IGoalRecordRepository,
  type IWalletRepository,
} from './server';
export type { IHabitRepository } from './server/application/use-cases/commands/habit.use-cases';
export type { GoalWriteTransactionRunner } from './server/application/use-cases/commands/goal-write-support';

export {
  GoalTaskProgressHandler,
  createGoalTaskProgressHandler,
  type TaskGoalProgressHandler,
} from './server/application';

export type {
  GoalDeletionTransactionRunner,
  GoalDeletionTransactionContext,
  GoalRelationCleanupPort,
} from './server/application';
