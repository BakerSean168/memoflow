export type {
  AICostEstimate,
  AIExecutionRecordInput,
  IAIExecutionRecordPort,
  IAIUsageReadPort,
  AIUsageQuery,
  AIUsageSummary,
} from './ai-execution-record.port';
export type {
  AIEvaluationCheckRecord,
  AIEvaluationHistoryRecord,
  AIEvaluationOverview,
  AIEvaluationReportMode,
  AIEvaluationReportRecord,
  AIEvaluationResultRecord,
  GetAIEvaluationOverviewInput,
  IAIEvaluationReportPort,
} from './ai-evaluation-report.port';
export type {
  AnalyticsOwnerReads,
  AnalyticsScheduleItem,
  AnalyticsTaskBoard,
  AnalyticsTaskDashboard,
  IAITaskDashboardReadPort,
  AnalyticsQueryContext,
  AnalyticsQueryInput,
  AnalyticsQueryResult,
  IAnalyticsQueryPort,
} from './analytics-query.port';
export type { AIActivityItem, IAIActivityReadPort } from './activity-read.port';
export type { IAnalyticsReadPort } from './analytics-read.port';
export type {
  IAIProviderModelCatalogPort,
  ProviderModelCatalogInput,
} from './provider-model-catalog.port';
export type {
  AIModelCapabilitySnapshotInput,
  AIModelCatalogSnapshotInput,
  IAIModelCapabilitySnapshotPort,
  IAIModelCatalogPort,
} from './ai-model-resolution.port';
export type {
  IAIProviderSecretVault,
  ResolvedAIProviderCredential,
  StoreAIProviderCredentialInput,
  ResolveAIProviderCredentialInput,
  ReplaceAIProviderCredentialInput,
} from './provider-secret-vault.port';
export type {
  ChatExecutionCompleteInput,
  ChatExecutionCompleteResult,
  ChatExecutionMessage,
  ChatExecutionProviderConfig,
  ChatExecutionStreamChunk,
  ChatExecutionUsage,
  IAIChatExecutionPort,
} from './chat-execution.port';

export type {
  IKnowledgeIngestionPort,
  KnowledgeIndexedChunk,
  KnowledgeIndexedNote,
  KnowledgeIngestionInput,
  KnowledgeSourceNote,
} from './knowledge-ingestion.port';
export type {
  IKnowledgeIndexRepository,
  KnowledgeIndexDiagnostics,
  KnowledgeIndexFailureRecord,
} from './knowledge-index.port';
export type {
  IKnowledgeIndexStatusPort,
  KnowledgeIndexStatusUpdate,
} from './knowledge-index-status.port';
export type {
  CreateKnowledgeNotePersistenceInput,
  CreateKnowledgeNotePersistenceResult,
  IKnowledgeNotePersistencePort,
} from './knowledge-note-persistence.port';
export type {
  KnowledgeExpansionInput,
  KnowledgeExpansionResult,
  IKnowledgeQueryPort,
  KnowledgeQueryCitation,
  KnowledgeQueryInput,
  KnowledgeQueryResult,
} from './knowledge-query.port';
export type { IKnowledgeSourcePort } from './knowledge-source.port';

export type {
  IAIProviderCredentialProbePort,
  ProviderCredentialProbeInput,
} from './provider-credential-probe.port';
export type {
  IAIProviderEndpointPolicyPort,
  ProviderEndpointValidationInput,
} from './provider-endpoint-policy.port';
export type {
  IAIProviderOnboardingSessionRepository,
  AIProviderOnboardingSessionRecord,
  CreateAIProviderOnboardingSessionInput,
} from './provider-onboarding-session.repository';

export type {
  IAIProviderOnboardingCommitPort,
  AIProviderOnboardingCommitOutcome,
} from './provider-onboarding-commit.port';
export type {
  AIProtocolMethodId,
  AIWallClockTriggerInput,
  AIElapsedTriggerInput,
  AIActiveUsageTriggerInput,
  AIRoutineTriggerInput,
  AIRoutineCreateInput,
  AIRoutineCommandReceipt,
  IAIRoutineCommandPort,
} from './routine-command.port';
export type {
  AIPlannerRange,
  AIPlannerWindowSummary,
  AIPlannerConflictSummary,
  IAIPlannerReadPort,
} from './planner-read.port';
export type {
  AINotificationFactProjection,
  AINotificationActionReceipt,
  AIUnreadNotificationSummary,
  IAINotificationReadPort,
} from './notification-read.port';
