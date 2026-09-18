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
export {
  AIContextAssembler,
  aiContextInstruction,
  estimateAIContextTokens,
  readAIContextEnvelope,
  renderAIContextEnvelope,
  requireAIContextEnvelope,
  sanitizeAIContextValue,
  setAIContextRequestContext,
  type AIContextAssemblerOptions,
  type AIContextAssemblerPort,
  type AIContextAssemblyInput,
  type AIContextEntityInput,
  type AIContextSectionInput,
  type AIKnowledgeEvidenceInput,
} from './server/mastra/context';
export { AIEvaluationReportFileAdapter } from './server/infrastructure';
export {
  projectAIOwnerActivity,
  type AIOwnerActivityGoalFact,
  type AIOwnerActivityTaskPlanFact,
  type AIOwnerActivityTaskOccurrenceFact,
  type AIOwnerActivityScheduleFact,
  type ProjectAIOwnerActivityInput,
} from './server/application/services/owner-activity-projection';
export {
  projectPlannerCalendarEntry,
  projectPlannerTaskOccurrence,
  type PlannerProductTimePort,
} from './server/application/services/planner-owner-projection';
export {
  projectNotificationAction,
  projectNotificationFact,
  projectNotificationInboxPage,
} from './server/application/services/notification-owner-projection';
// Host capability ports are re-exported through the package root so desktop
// composers import only `@memoflow/ai` (no `/ports` subpath).
export type {
  AnalyticsOwnerReads,
  AnalyticsScheduleItem,
  AnalyticsTaskBoard,
  AnalyticsTaskDashboard,
  AnalyticsQueryContext,
  IAITaskDashboardReadPort,
  IAnalyticsReadPort,
  IAIActivityReadPort,
  AIActivityItem,
  IKnowledgeSourcePort,
  IKnowledgeNotePersistencePort,
  IAIRoutineCommandPort,
  IAIPlannerReadPort,
  IAINotificationReadPort,
  AIProtocolMethodId,
  AIWallClockTriggerInput,
  AIElapsedTriggerInput,
  AIActiveUsageTriggerInput,
  AIRoutineTriggerInput,
  AIRoutineCreateInput,
  AIRoutineCommandReceipt,
  AIPlannerRange,
  AIPlannerWindowSummary,
  AIPlannerConflictSummary,
  AINotificationFactProjection,
  AINotificationActionReceipt,
  AIUnreadNotificationSummary,
} from './ports';
