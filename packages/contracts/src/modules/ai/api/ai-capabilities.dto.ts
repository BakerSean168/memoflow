import { z } from 'zod';

/** AI-VNEXT: MemoFlow exposes one Agent/Workflow runtime across all hosts. */
export const AIRuntimeModeSchema = z.literal('mastra');
export type AIRuntimeMode = z.infer<typeof AIRuntimeModeSchema>;

export const AIKnowledgeIndexDiagnosticsSchema = z.object({
  persistenceBackend: z.enum(['powersync-local-knowledge-index', 'prisma-index-table']),
  persistenceStatus: z.enum(['enabled', 'fallback']),
  persistenceReason: z.string().optional(),
  vectorRecallBackend: z.enum(['none', 'local-js-hybrid', 'pgvector-ivfflat']),
  vectorRecallStatus: z.enum(['enabled', 'fallback', 'unknown']),
  vectorRecallReason: z.string().optional(),
});
export type AIKnowledgeIndexDiagnostics = z.infer<typeof AIKnowledgeIndexDiagnosticsSchema>;

export const AICapabilitiesSchema = z.object({
  runtimeMode: AIRuntimeModeSchema,
  supportsChat: z.boolean(),
  supportsKnowledgeNotes: z.boolean(),
  supportsKnowledgeQuery: z.boolean(),
  supportsKnowledgeReindex: z.boolean(),
  supportsAnalyticsQuery: z.boolean(),
  supportsAssistantRuntime: z.boolean(),
  supportsWorkflowRuntime: z.boolean(),
  supportsEvaluationReports: z.boolean(),
  advancedFeaturesReason: z.string().optional(),
  knowledgeIndexDiagnostics: AIKnowledgeIndexDiagnosticsSchema.optional(),
});

export type AICapabilities = z.infer<typeof AICapabilitiesSchema>;
