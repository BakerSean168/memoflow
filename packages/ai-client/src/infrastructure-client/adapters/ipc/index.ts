/** Product-only AI IPC adapters. Runtime execution uses dedicated Mastra clients. */

import type { IResultIpcClient } from '../types';
import { AICapabilitiesIpcAdapter } from './ai-capabilities-ipc.adapter';
import { AIAnalyticsQueryIpcAdapter } from './ai-analytics-query-ipc.adapter';
import { AIConversationIpcAdapter } from './ai-conversation-ipc.adapter';
import { AIEvaluationReportIpcAdapter } from './ai-evaluation-report-ipc.adapter';
import { AIProviderConfigIpcAdapter } from './ai-provider-config-ipc.adapter';
import { AIKnowledgeQueryIpcAdapter } from './ai-knowledge-query-ipc.adapter';

export { AICapabilitiesIpcAdapter } from './ai-capabilities-ipc.adapter';
export { AIAnalyticsQueryIpcAdapter } from './ai-analytics-query-ipc.adapter';
export { AIConversationIpcAdapter } from './ai-conversation-ipc.adapter';
export { AIEvaluationReportIpcAdapter } from './ai-evaluation-report-ipc.adapter';
export { AIProviderConfigIpcAdapter } from './ai-provider-config-ipc.adapter';
export { AIKnowledgeQueryIpcAdapter } from './ai-knowledge-query-ipc.adapter';

export interface AIIpcAdapters {
  capabilities: AICapabilitiesIpcAdapter;
  analytics: AIAnalyticsQueryIpcAdapter;
  conversation: AIConversationIpcAdapter;
  evaluationReport: AIEvaluationReportIpcAdapter;
  providerConfig: AIProviderConfigIpcAdapter;
  knowledge: AIKnowledgeQueryIpcAdapter;
}

export function createAIIpcAdapters(ipcClient: IResultIpcClient): AIIpcAdapters {
  return {
    capabilities: new AICapabilitiesIpcAdapter(ipcClient),
    analytics: new AIAnalyticsQueryIpcAdapter(ipcClient),
    conversation: new AIConversationIpcAdapter(ipcClient),
    evaluationReport: new AIEvaluationReportIpcAdapter(ipcClient),
    providerConfig: new AIProviderConfigIpcAdapter(ipcClient),
    knowledge: new AIKnowledgeQueryIpcAdapter(ipcClient),
  };
}
