import type {
  UpdateAIProviderConfigReq,
  UpdateAIProviderConfigRes,
  ListAIProviderConfigsRes,
  GetAIProviderConfigRes,
  DeleteAIProviderConfigRes,
  TestAIProviderReq,
  TestAIProviderRes,
  SetDefaultAIProviderReq,
  SetDefaultAIProviderRes,
} from '../api/ai-provider-config.dto';
import type {
  CreateConversationReq,
  CreateConversationRes,
  UpdateConversationReq,
  UpdateConversationRes,
  ListConversationsQuery,
  ConversationListRes,
  GetConversationRes,
  DeleteConversationRes,
} from '../api/ai-chat.dto';
import type { ExpandKnowledgeReq, ExpandKnowledgeRes } from '../api/ai-knowledge-expansion.dto';
import type { QueryAnalyticsReq, QueryAnalyticsRes } from '../api/ai-analytics-query.dto';
import type { QueryKnowledgeReq, QueryKnowledgeRes } from '../api/ai-knowledge-query.dto';
import type {
  AssistantRuntimeClientCommand,
  AssistantRuntimeCancelResult,
  AssistantRuntimeConversationDeleteResult,
  AssistantRuntimeHistoryClientRequest,
  AssistantRuntimeHistoryView,
  AIWorkflowCancelClientRequest,
  AIWorkflowGetClientRequest,
  AIWorkflowListClientRequest,
  AIWorkflowResumeClientRequest,
  AIWorkflowRunView,
  AIWorkflowStartClientRequest,
} from '../api/ai-runtime.dto';
import type { AiProviderConfigId, AiConversationId } from '../../../primitives';

/** Canonical cross-process AI RPC map after the Mastra cutover. */
export type AIRpcMap = {
  'ai:provider:update': [UpdateAIProviderConfigReq, UpdateAIProviderConfigRes];
  'ai:provider:list': [void, ListAIProviderConfigsRes];
  'ai:provider:get': [AiProviderConfigId, GetAIProviderConfigRes];
  'ai:provider:delete': [AiProviderConfigId, DeleteAIProviderConfigRes];
  'ai:provider:test': [TestAIProviderReq, TestAIProviderRes];
  'ai:provider:set-default': [SetDefaultAIProviderReq, SetDefaultAIProviderRes];

  'ai:chat:conversation:create': [CreateConversationReq, CreateConversationRes];
  'ai:chat:conversation:update': [
    UpdateConversationReq & { id: AiConversationId },
    UpdateConversationRes,
  ];
  'ai:chat:conversation:list': [ListConversationsQuery | undefined, ConversationListRes];
  'ai:chat:conversation:get': [AiConversationId, GetConversationRes];
  'ai:chat:conversation:delete': [AiConversationId, DeleteConversationRes];

  'ai:runtime:assistant:start': [
    { streamId: string; command: AssistantRuntimeClientCommand },
    void,
  ];
  'ai:runtime:assistant:cancel': [AssistantRuntimeClientCommand, AssistantRuntimeCancelResult];
  'ai:runtime:assistant:history': [
    AssistantRuntimeHistoryClientRequest,
    AssistantRuntimeHistoryView,
  ];
  'ai:runtime:assistant:delete': [
    AssistantRuntimeHistoryClientRequest,
    AssistantRuntimeConversationDeleteResult,
  ];
  'ai:runtime:workflow:start': [AIWorkflowStartClientRequest, AIWorkflowRunView];
  'ai:runtime:workflow:resume': [AIWorkflowResumeClientRequest, AIWorkflowRunView];
  'ai:runtime:workflow:get': [AIWorkflowGetClientRequest, AIWorkflowRunView | null];
  'ai:runtime:workflow:list': [AIWorkflowListClientRequest, readonly AIWorkflowRunView[]];
  'ai:runtime:workflow:cancel': [AIWorkflowCancelClientRequest, AIWorkflowRunView | null];

  'ai:knowledge:expand': [ExpandKnowledgeReq, ExpandKnowledgeRes];
  'ai:knowledge:query': [QueryKnowledgeReq, QueryKnowledgeRes];
  'ai:analytics:query': [QueryAnalyticsReq, QueryAnalyticsRes];
};
