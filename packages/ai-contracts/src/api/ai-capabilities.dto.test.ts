import { describe, expect, it } from 'vitest';
import { AICapabilitiesSchema, AIRuntimeModeSchema } from './ai-capabilities.dto';

const validCapabilities = {
  runtimeMode: 'mastra',
  supportsChat: true,
  supportsKnowledgeNotes: true,
  supportsKnowledgeQuery: true,
  supportsKnowledgeReindex: true,
  supportsAnalyticsQuery: true,
  supportsAssistantRuntime: true,
  supportsWorkflowRuntime: true,
  supportsEvaluationReports: true,
} as const;

describe('AI capabilities contract schema', () => {
  it('accepts only the canonical Mastra runtime mode', () => {
    expect(AIRuntimeModeSchema.parse('mastra')).toBe('mastra');
    expect(AIRuntimeModeSchema.safeParse('direct-provider').success).toBe(false);
    expect(AIRuntimeModeSchema.safeParse('remote-ai-service').success).toBe(false);
  });

  it('requires the capability flags used by product clients', () => {
    expect(AICapabilitiesSchema.parse(validCapabilities).supportsAssistantRuntime).toBe(true);
    const { supportsAssistantRuntime: _ignored, ...missing } = validCapabilities;
    expect(AICapabilitiesSchema.safeParse(missing).success).toBe(false);
  });
});
