import type { AICapabilities, AIRuntimeMode } from '@memoflow/ai-contracts';

export const ADVANCED_AI_REASON =
  'Some optional AI product capabilities are unavailable in this host composition.';

export interface CapabilityAssemblyInput {
  supportsKnowledgeNotes?: boolean;
  supportsKnowledgeQuery?: boolean;
  supportsAnalyticsQuery?: boolean;
  supportsAssistantRuntime?: boolean;
  supportsWorkflowRuntime?: boolean;
  supportsEvaluationReports?: boolean;
}

/** Build the product capability projection for the single Mastra runtime. */
export function assembleCapabilities(
  runtimeMode: AIRuntimeMode,
  input: CapabilityAssemblyInput = {},
): AICapabilities {
  const supportsKnowledgeNotes = Boolean(input.supportsKnowledgeNotes);
  const supportsKnowledgeQuery = Boolean(input.supportsKnowledgeQuery);
  const supportsAnalyticsQuery = Boolean(input.supportsAnalyticsQuery);
  const supportsAssistantRuntime = Boolean(input.supportsAssistantRuntime);
  const supportsWorkflowRuntime = Boolean(input.supportsWorkflowRuntime);
  const supportsEvaluationReports = Boolean(input.supportsEvaluationReports);
  const allOptionalAvailable =
    supportsKnowledgeNotes &&
    supportsKnowledgeQuery &&
    supportsAnalyticsQuery &&
    supportsAssistantRuntime &&
    supportsWorkflowRuntime &&
    supportsEvaluationReports;

  return {
    runtimeMode,
    supportsChat: supportsAssistantRuntime,
    supportsKnowledgeNotes,
    supportsKnowledgeQuery,
    supportsKnowledgeReindex: supportsKnowledgeQuery,
    supportsAnalyticsQuery,
    supportsAssistantRuntime,
    supportsWorkflowRuntime,
    supportsEvaluationReports,
    advancedFeaturesReason: allOptionalAvailable ? undefined : ADVANCED_AI_REASON,
  };
}
