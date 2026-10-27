/** Product-only AI HTTP adapters. Runtime execution uses dedicated Mastra clients. */

import type { IResultHttpClient } from '../types';
import { AICapabilitiesHttpAdapter } from './ai-capabilities-http.adapter';
import { AIAnalyticsQueryHttpAdapter } from './ai-analytics-query-http.adapter';
import { AIConversationHttpAdapter } from './ai-conversation-http.adapter';
import { AIEvaluationReportHttpAdapter } from './ai-evaluation-report-http.adapter';
import { AIProviderConfigHttpAdapter } from './ai-provider-config-http.adapter';
import { AIKnowledgeQueryHttpAdapter } from './ai-knowledge-query-http.adapter';

export { AICapabilitiesHttpAdapter } from './ai-capabilities-http.adapter';
export { AIAnalyticsQueryHttpAdapter } from './ai-analytics-query-http.adapter';
export { AIConversationHttpAdapter } from './ai-conversation-http.adapter';
export { AIEvaluationReportHttpAdapter } from './ai-evaluation-report-http.adapter';
export { AIProviderConfigHttpAdapter } from './ai-provider-config-http.adapter';
export { AIKnowledgeQueryHttpAdapter } from './ai-knowledge-query-http.adapter';

export interface AIHttpAdapters {
  capabilities: AICapabilitiesHttpAdapter;
  analytics: AIAnalyticsQueryHttpAdapter;
  conversation: AIConversationHttpAdapter;
  evaluationReport: AIEvaluationReportHttpAdapter;
  providerConfig: AIProviderConfigHttpAdapter;
  knowledge: AIKnowledgeQueryHttpAdapter;
}

export function createAIHttpAdapters(httpClient: IResultHttpClient): AIHttpAdapters {
  return {
    capabilities: new AICapabilitiesHttpAdapter(httpClient),
    analytics: new AIAnalyticsQueryHttpAdapter(httpClient),
    conversation: new AIConversationHttpAdapter(httpClient),
    evaluationReport: new AIEvaluationReportHttpAdapter(httpClient),
    providerConfig: new AIProviderConfigHttpAdapter(httpClient),
    knowledge: new AIKnowledgeQueryHttpAdapter(httpClient),
  };
}
