/** Product-only AI client adapter contracts after the Mastra cutover. */

import type { IResultHttpClient } from '@memoflow/http-client';
import type { Result } from '@memoflow/transport-contracts/result';
import type {
  AICapabilities,
  AIConversationClientDTO,
  AIProviderConfigClientDTO,
  ConversationListRes,
  CreateConversationReq,
  ExpandKnowledgeReq,
  ExpandKnowledgeRes,
  GetAIEvaluationOverviewReq,
  GetAIEvaluationOverviewRes,
  QueryAnalyticsReq,
  QueryAnalyticsRes,
  QueryKnowledgeReq,
  QueryKnowledgeRes,
  ReindexKnowledgeReq,
  ReindexKnowledgeRes,
  SetDefaultAIProviderReq,
  TestAIProviderReq,
  TestAIProviderRes,
  UpdateAIProviderConfigReq,
  UpdateConversationReq,
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

export type { IResultHttpClient };
export type { IResultIpcClient } from '@memoflow/ipc-client';

export interface IAICapabilitiesApiClient {
  getCapabilities(): Promise<Result<AICapabilities>>;
}

export interface AIEvaluationReportApiClient {
  getEvaluationOverview(
    request?: GetAIEvaluationOverviewReq,
  ): Promise<Result<GetAIEvaluationOverviewRes>>;
}

export interface IAIConversationApiClient {
  createConversation(request: CreateConversationReq): Promise<Result<AIConversationClientDTO>>;
  updateConversation(
    id: string,
    request: UpdateConversationReq,
  ): Promise<Result<AIConversationClientDTO>>;
  getConversations(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<Result<ConversationListRes>>;
  getConversationById(id: string): Promise<Result<AIConversationClientDTO>>;
  deleteConversation(id: string): Promise<Result<void>>;
}

export interface IAIProviderConfigApiClient {
  getProviderCatalog(): Promise<Result<ListAIProviderCatalogRes>>;
  probeProviderConnection(
    request: ProbeAIProviderConnectionReq,
  ): Promise<Result<ProbeAIProviderConnectionRes>>;
  testProviderOnboardingModel(
    request: TestAIProviderOnboardingModelReq,
  ): Promise<Result<TestAIProviderOnboardingModelRes>>;
  commitProviderOnboarding(
    request: CommitAIProviderOnboardingReq,
  ): Promise<Result<AIProviderConfigClientDTO>>;
  probeProviderReplacement(
    id: string,
    request: ProbeAIProviderReplacementReq,
  ): Promise<Result<ProbeAIProviderConnectionRes>>;
  commitProviderReplacement(
    id: string,
    request: CommitAIProviderReplacementReq,
  ): Promise<Result<AIProviderConfigClientDTO>>;
  getProviders(): Promise<Result<AIProviderConfigClientDTO[]>>;
  getProviderById(id: string): Promise<Result<AIProviderConfigClientDTO>>;
  updateProvider(
    id: string,
    request: UpdateAIProviderConfigReq,
  ): Promise<Result<AIProviderConfigClientDTO>>;
  deleteProvider(id: string): Promise<Result<void>>;
  testConnection(request: TestAIProviderReq): Promise<Result<TestAIProviderRes>>;
  setDefaultProvider(request: SetDefaultAIProviderReq): Promise<Result<void>>;
  refreshProviderModels(id: string): Promise<Result<AIProviderModelCatalogSnapshot>>;
}

export interface AIKnowledgeQueryApiClient {
  expandKnowledge(request: ExpandKnowledgeReq): Promise<Result<ExpandKnowledgeRes>>;
  queryKnowledge(request: QueryKnowledgeReq): Promise<Result<QueryKnowledgeRes>>;
  reindexKnowledge(request: ReindexKnowledgeReq): Promise<Result<ReindexKnowledgeRes>>;
}

export interface AIAnalyticsQueryApiClient {
  queryAnalytics(request: QueryAnalyticsReq): Promise<Result<QueryAnalyticsRes>>;
}
