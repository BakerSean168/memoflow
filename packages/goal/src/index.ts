/**
 * @memoflow/goal
 *
 * Goal module runtime root.
 *
 * Public goal contracts are centralized in
 * `@memoflow/goal-contracts`.
 * Root exports are limited to the canonical server composition root.
 * Client / API / Electron seams use dedicated subpaths.
 * Goal-specific analytics, events, and schedule orchestration seams
 * remain on their dedicated subpaths.
 */

export {
  createGoalModule,
  createGoalPrismaModule,
  createGoalPrismaRepositories,
  createGoalPrismaPageQuery,
  createGoalTaskProgressPrismaHandler,
  createGoalPrismaDeletionTransactionRunner,
  createGoalPowerSyncModule,
  createGoalPowerSyncRepositories,
  createGoalTaskProgressPowerSyncHandler,
  createGoalPowerSyncDeletionTransactionRunner,
  createGoalRuntimeContribution,
  createGoalEventListenersRuntime,
  createGoalPortableCapability,
  GoalPortableCapability,
  createGoalUseCases,
  GoalWorkspaceQueryService,
  GoalActivityReadService,
  type GoalActivityItem,
  type GoalActivityReadOptions,
  type GoalActivityReadServiceDependencies,
  normalizeGoalRuntimeContributions,
  type GoalApplicationPort,
  type GoalPortabilityApplicationPort,
  type GoalWorkspaceKnowledgeContextReadPort,
  type GoalWorkspaceKnowledgeProjection,
  type GoalWorkspaceKnowledgeRelationReadPort,
  type GoalWorkspaceTaskContextReadPort,
  type GoalWorkspaceApplicationPort,
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
export type { IHabitRepository } from './server/domain/repositories/i-habit-repository';
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

export { createGoalPowerSyncPageQuery } from './server/infrastructure/adapters/powersync/goal-page-reader';
export { createGoalPowerSyncMeasurementReader } from './server/infrastructure/adapters/powersync/goal-measurement-reader';

export {
  createGoalPowerSyncAgentMutations,
  GoalAgentMutationError,
} from './server/infrastructure/adapters/powersync/goal-agent-mutations';
export { createGoalBusinessDataPresence } from './server/infrastructure/business-data-presence';
export {
  createGoalPrismaPortableCapability,
  createGoalPowerSyncPortableCapability,
} from './server/infrastructure/goal-profile-import';

export { createGoalPrismaAgentMutations } from './server/infrastructure/adapters/prisma/goal-agent-mutations';
export { createGoalPrismaAgentReadPort } from './server/infrastructure/adapters/prisma/goal-agent-mutations';
