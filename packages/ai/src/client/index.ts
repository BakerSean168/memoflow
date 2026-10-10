/**
 * AI product client seam.
 *
 * Runtime execution is intentionally split out into `AssistantRuntimeClient` and
 * `WorkflowRuntimeClient`. This product client only covers provider config,
 * conversation shell metadata, deterministic knowledge services, analytics and
 * eval projections.
 */

import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import type { AiProviderConfigId } from '@memoflow/contracts/primitives';
import type { Result } from '@memoflow/contracts/result';
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
import { createAIHttpAdapters, type AIHttpAdapters } from '../infrastructure-client/adapters/http';
import { createAIIpcAdapters, type AIIpcAdapters } from '../infrastructure-client/adapters/ipc';

export interface AIClientPort {
  getCapabilities(): Promise<Result<AICapabilities>>;
  getEvaluationOverview(
    request?: GetAIEvaluationOverviewReq,
  ): Promise<Result<GetAIEvaluationOverviewRes>>;

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

  updateProvider(
    id: string,
    request: UpdateAIProviderConfigReq,
  ): Promise<Result<AIProviderConfigClientDTO>>;
  listProviders(): Promise<Result<AIProviderConfigClientDTO[]>>;
  getProvider(id: string): Promise<Result<AIProviderConfigClientDTO>>;
  deleteProvider(id: string): Promise<Result<void>>;
  testProvider(request: TestAIProviderReq): Promise<Result<TestAIProviderRes>>;
  setDefaultProvider(providerId: string): Promise<Result<void>>;
  refreshProviderModels(id: string): Promise<Result<AIProviderModelCatalogSnapshot>>;

  createConversation(request: CreateConversationReq): Promise<Result<AIConversationClientDTO>>;
  updateConversation(
    id: string,
    request: UpdateConversationReq,
  ): Promise<Result<AIConversationClientDTO>>;
  listConversations(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<Result<ConversationListRes>>;
  getConversation(id: string): Promise<Result<AIConversationClientDTO>>;
  deleteConversation(id: string): Promise<Result<void>>;

  queryKnowledge(request: QueryKnowledgeReq): Promise<Result<QueryKnowledgeRes>>;
  expandKnowledge(request: ExpandKnowledgeReq): Promise<Result<ExpandKnowledgeRes>>;
  reindexKnowledge(request: ReindexKnowledgeReq): Promise<Result<ReindexKnowledgeRes>>;
  queryAnalytics(request: QueryAnalyticsReq): Promise<Result<QueryAnalyticsRes>>;
}

interface ProductAdapters {
  readonly capabilities: AIHttpAdapters['capabilities'] | AIIpcAdapters['capabilities'];
  readonly evaluationReport: AIHttpAdapters['evaluationReport'] | AIIpcAdapters['evaluationReport'];
  readonly providerConfig: AIHttpAdapters['providerConfig'] | AIIpcAdapters['providerConfig'];
  readonly conversation: AIHttpAdapters['conversation'] | AIIpcAdapters['conversation'];
  readonly knowledge: AIHttpAdapters['knowledge'] | AIIpcAdapters['knowledge'];
  readonly analytics: AIHttpAdapters['analytics'] | AIIpcAdapters['analytics'];
}

function createProductClient(adapters: ProductAdapters): AIClientPort {
  return {
    getCapabilities: () => adapters.capabilities.getCapabilities(),
    getEvaluationOverview: (request) => adapters.evaluationReport.getEvaluationOverview(request),

    getProviderCatalog: () => adapters.providerConfig.getProviderCatalog(),
    probeProviderConnection: (request) => adapters.providerConfig.probeProviderConnection(request),
    testProviderOnboardingModel: (request) =>
      adapters.providerConfig.testProviderOnboardingModel(request),
    commitProviderOnboarding: (request) =>
      adapters.providerConfig.commitProviderOnboarding(request),
    probeProviderReplacement: (id, request) =>
      adapters.providerConfig.probeProviderReplacement(id, request),
    commitProviderReplacement: (id, request) =>
      adapters.providerConfig.commitProviderReplacement(id, request),

    updateProvider: (id, request) => adapters.providerConfig.updateProvider(id, request),
    listProviders: () => adapters.providerConfig.getProviders(),
    getProvider: (id) => adapters.providerConfig.getProviderById(id),
    deleteProvider: (id) => adapters.providerConfig.deleteProvider(id),
    testProvider: (request) => adapters.providerConfig.testConnection(request),
    setDefaultProvider: (providerId) =>
      adapters.providerConfig.setDefaultProvider({ providerId: providerId as AiProviderConfigId }),
    refreshProviderModels: (id) => adapters.providerConfig.refreshProviderModels(id),

    createConversation: (request) => adapters.conversation.createConversation(request),
    updateConversation: (id, request) => adapters.conversation.updateConversation(id, request),
    listConversations: (params) => adapters.conversation.getConversations(params),
    getConversation: (id) => adapters.conversation.getConversationById(id),
    deleteConversation: (id) => adapters.conversation.deleteConversation(id),

    queryKnowledge: (request) => adapters.knowledge.queryKnowledge(request),
    expandKnowledge: (request) => adapters.knowledge.expandKnowledge(request),
    reindexKnowledge: (request) => adapters.knowledge.reindexKnowledge(request),
    queryAnalytics: (request) => adapters.analytics.queryAnalytics(request),
  };
}

export function createAIHttpClient(httpClient: IResultHttpClient): AIClientPort {
  return createProductClient(createAIHttpAdapters(httpClient));
}

export function createAIIpcClient(ipcClient: IResultIpcClient): AIClientPort {
  return createProductClient(createAIIpcAdapters(ipcClient));
}

export type { IResultHttpClient, IResultIpcClient, AIHttpAdapters, AIIpcAdapters };
export { createAIHttpAdapters, createAIIpcAdapters } from '../infrastructure-client/adapters';
export {
  AssistantRuntimeHttpClient,
  AssistantRuntimeIpcClient,
  createAssistantRuntimeHttpClient,
  createAssistantRuntimeIpcClient,
  type AssistantRuntimeClient,
  type AssistantRuntimeHandlers,
  type AssistantRuntimeMessageCommand,
} from './runtime-assistant';
export {
  WorkflowRuntimeHttpClient,
  WorkflowRuntimeIpcClient,
  createWorkflowRuntimeHttpClient,
  createWorkflowRuntimeIpcClient,
  type WorkflowRuntimeClient,
} from './runtime-workflow';

export {
  RuntimeUsageHttpClient,
  RuntimeUsageIpcClient,
  createRuntimeUsageHttpClient,
  createRuntimeUsageIpcClient,
  type RuntimeUsageClient,
} from './runtime-usage';
export { createLocalAgentIpcClient, type LocalAgentClient } from './local-agent';
export {
  createAgentRegistryHttpClient,
  createAgentRegistryIpcClient,
  type AgentRegistryClient,
} from './agent-instance';
