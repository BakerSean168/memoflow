import type { Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  AICapabilities,
  AIConversationClientDTO,
  ConversationListRes,
  UpdateConversationReq,
  UpdateConversationRes,
  UpdateAIProviderConfigReq,
  UpdateAIProviderConfigRes,
  TestAIProviderReq,
  TestAIProviderRes,
  AIProviderConfigClientDTO,
  ExpandKnowledgeReq,
  ExpandKnowledgeRes,
  QueryAnalyticsReq,
  QueryAnalyticsRes,
  GetAIEvaluationOverviewReq,
  GetAIEvaluationOverviewRes,
  QueryKnowledgeReq,
  QueryKnowledgeRes,
  ReindexKnowledgeReq,
  ReindexKnowledgeRes,
  ListAIProviderCatalogRes,
  ProbeAIProviderConnectionReq,
  ProbeAIProviderConnectionRes,
  TestAIProviderOnboardingModelReq,
  TestAIProviderOnboardingModelRes,
  CommitAIProviderOnboardingReq,
  ProbeAIProviderReplacementReq,
  CommitAIProviderReplacementReq,
  AIProviderModelCatalogSnapshot,
} from '@memoflow/contracts/ai';

/**
 * Settings and provider onboarding/configuration capability.
 *
 * `getCapabilities` stays here because the current Settings/provider
 * consumer loads the public runtime capability summary alongside provider
 * catalog and configuration state.
 */
export interface AIProviderManagementPort {
  getCapabilities(): Promise<Result<AICapabilities>>;

  getProviderCatalog(): Promise<Result<ListAIProviderCatalogRes>>;
  probeProviderConnection(
    req: ProbeAIProviderConnectionReq,
    cx: ExecutionContext,
  ): Promise<Result<ProbeAIProviderConnectionRes>>;
  testProviderOnboardingModel(
    req: TestAIProviderOnboardingModelReq,
    cx: ExecutionContext,
  ): Promise<Result<TestAIProviderOnboardingModelRes>>;
  commitProviderOnboarding(
    req: CommitAIProviderOnboardingReq,
    cx: ExecutionContext,
  ): Promise<Result<AIProviderConfigClientDTO>>;
  probeProviderReplacement(
    providerId: string,
    req: ProbeAIProviderReplacementReq,
    cx: ExecutionContext,
  ): Promise<Result<ProbeAIProviderConnectionRes>>;
  commitProviderReplacement(
    providerId: string,
    req: CommitAIProviderReplacementReq,
    cx: ExecutionContext,
  ): Promise<Result<AIProviderConfigClientDTO>>;

  /** Secrets/endpoints are changed only through the provider onboarding flows. */
  updateProvider(
    id: string,
    req: UpdateAIProviderConfigReq,
    cx: ExecutionContext,
  ): Promise<Result<UpdateAIProviderConfigRes>>;
  deleteProvider(id: string, cx: ExecutionContext): Promise<Result<void>>;
  getProvider(id: string, cx: ExecutionContext): Promise<Result<AIProviderConfigClientDTO>>;
  listProviders(cx: ExecutionContext): Promise<Result<AIProviderConfigClientDTO[]>>;
  testConnection(req: TestAIProviderReq, cx: ExecutionContext): Promise<Result<TestAIProviderRes>>;
  setDefaultProvider(id: string, cx: ExecutionContext): Promise<Result<void>>;
  refreshProviderModels(
    providerId: string,
    cx: ExecutionContext,
  ): Promise<Result<AIProviderModelCatalogSnapshot>>;
}

/** Assistant conversation shell capability; Mastra remains runtime authority. */
export interface AssistantConversationPort {
  createConversation(cx: ExecutionContext, name?: string): Promise<Result<AIConversationClientDTO>>;
  updateConversation(
    id: string,
    req: UpdateConversationReq,
    cx: ExecutionContext,
  ): Promise<Result<UpdateConversationRes>>;
  listConversations(
    cx: ExecutionContext,
    page?: number,
    pageSize?: number,
  ): Promise<Result<ConversationListRes>>;
  getConversation(
    id: string,
    cx: ExecutionContext,
  ): Promise<Result<AIConversationClientDTO | null>>;
  deleteConversation(id: string, cx: ExecutionContext): Promise<Result<void>>;
}

/** Knowledge QA, expansion, and index administration capability. */
export interface AIKnowledgePort {
  expandKnowledge(
    req: ExpandKnowledgeReq,
    cx: ExecutionContext,
  ): Promise<Result<ExpandKnowledgeRes>>;
  queryKnowledge(req: QueryKnowledgeReq, cx: ExecutionContext): Promise<Result<QueryKnowledgeRes>>;
  reindexKnowledge(
    req: ReindexKnowledgeReq,
    cx: ExecutionContext,
  ): Promise<Result<ReindexKnowledgeRes>>;
}

/** Evaluation and operational overview read capability. */
export interface AIEvaluationOperationsPort {
  queryAnalytics(req: QueryAnalyticsReq, cx: ExecutionContext): Promise<Result<QueryAnalyticsRes>>;
  getEvaluationOverview(
    req?: GetAIEvaluationOverviewReq,
  ): Promise<Result<GetAIEvaluationOverviewRes>>;
}
