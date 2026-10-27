/** Product-only AI infrastructure clients after the Mastra runtime cutover. */

export type {
  IResultHttpClient,
  IResultIpcClient,
  IAICapabilitiesApiClient,
  AIEvaluationReportApiClient,
  AIAnalyticsQueryApiClient,
  IAIConversationApiClient,
  AIKnowledgeQueryApiClient,
  IAIProviderConfigApiClient,
} from './adapters/types';

export {
  AICapabilitiesHttpAdapter,
  AIAnalyticsQueryHttpAdapter,
  AIConversationHttpAdapter,
  AIEvaluationReportHttpAdapter,
  AIKnowledgeQueryHttpAdapter,
  AIProviderConfigHttpAdapter,
  createAIHttpAdapters,
  AICapabilitiesIpcAdapter,
  AIAnalyticsQueryIpcAdapter,
  AIConversationIpcAdapter,
  AIEvaluationReportIpcAdapter,
  AIKnowledgeQueryIpcAdapter,
  AIProviderConfigIpcAdapter,
  createAIIpcAdapters,
} from './adapters';

export * from './prompts';
