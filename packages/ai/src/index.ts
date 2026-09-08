/**
 * @memoflow/ai
 *
 * AI module runtime root.
 *
 * Public AI contracts are centralized in `@memoflow/contracts/ai`.
 * Root exports are limited to the canonical server composition roots:
 * ingredient factories, set types, module factory, runtime contribution
 * factories and port types. Client / API / Electron seams use dedicated
 * subpaths.
 *
 * AI-VNEXT-07: legacy AIService*Adapter exports are removed — Mastra is the
 * only runtime. The ai-service runtime config is removed.
 */

export {
  createAIModule,
  createAIPowerSyncRepositories,
  createAIPrismaRepositories,
  createMastraStorage,
  ConversationTranscriptBootstrapSource,
  MastraAIRuntime,
  MastraModelResolver,
  type MastraStorageConfig,
  type AIModuleDependencies,
  type AIModuleInstance,
  type AIModuleServices,
  type AIApplicationPort,
  type AIModuleRuntimeContribution,
  type AIRuntimeContributionsInput,
  type AIPowerSyncRepositorySet,
  type AIPrismaRepositorySet,
  type IAIConversationRepository,
  type IAIProviderConfigRepository,
  KnowledgeCapturePersistenceAdapter,
  type GoalPlanMutationPort,
  type TaskPlanMutationPort,
  type KnowledgeCaptureMutationPort,
} from './server';
export { AIEvaluationReportFileAdapter } from './server/infrastructure';
// Host capability ports are re-exported through the package root so desktop
// composers import only `@memoflow/ai` (no `/ports` subpath).
export type {
  IAnalyticsReadPort,
  IKnowledgeSourcePort,
  IKnowledgeNotePersistencePort,
  IAIRoutineCommandPort,
  IAIPlannerReadPort,
  IAINotificationReadPort,
  AIRoutineCreateInput,
  AIRoutineCommandReceipt,
  AIPlannerWindowSummary,
  AIPlannerConflictSummary,
  AIPlannerTaskItem,
  AIUnreadNotificationSummary,
} from './ports';
