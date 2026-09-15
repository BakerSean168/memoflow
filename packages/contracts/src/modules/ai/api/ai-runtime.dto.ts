import { z } from 'zod';
import {
  GoalCreateClientInputSchema,
  GoalPlanDraftSchema,
  GoalPlanExecutionFailureSchema,
  GoalPlanExecutionReceiptSchema,
} from './ai-goal-create-workflow.dto';
import {
  TaskCreateClientInputSchema,
  TaskPlanDraftSchema,
  TaskPlanExecutionFailureSchema,
  TaskPlanExecutionReceiptSchema,
} from './ai-task-create-workflow.dto';
import {
  KnowledgeCaptureClientInputSchema,
  KnowledgeCaptureExecutionFailureSchema,
  KnowledgeCaptureExecutionReceiptSchema,
  KnowledgeDraftSchema,
} from './ai-knowledge-capture-workflow.dto';

/**
 * MemoFlow AI vNext cross-boundary contracts.
 *
 * These schemas intentionally do not expose Mastra private event/snapshot types.
 * The host owns authentication and injects identity from ExecutionContext; any
 * client payload that attempts to smuggle identityId is rejected.
 */

export const AIRuntimeSurfaceSchema = z.enum(['web', 'desktop', 'mobile', 'server']);
export type AIRuntimeSurface = z.infer<typeof AIRuntimeSurfaceSchema>;

export const AssistantRuntimeClientCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('message'),
      conversationId: z.string().min(1),
      content: z.string().min(1),
      surface: AIRuntimeSurfaceSchema,
      providerId: z.string().min(1).optional(),
      modelId: z.string().min(1).optional(),
      locale: z.enum(['zh-CN', 'en-US']).optional(),
      identityId: z.never().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('cancel_run'),
      runId: z.string().min(1),
      identityId: z.never().optional(),
    })
    .strict(),
]);
export type AssistantRuntimeClientCommand = z.infer<typeof AssistantRuntimeClientCommandSchema>;

export const AssistantRuntimeHistoryClientRequestSchema = z
  .object({
    conversationId: z.string().min(1),
    identityId: z.never().optional(),
  })
  .strict();
export type AssistantRuntimeHistoryClientRequest = z.infer<
  typeof AssistantRuntimeHistoryClientRequestSchema
>;

export const AssistantRuntimeMessageViewSchema = z
  .object({
    id: z.string().min(1),
    conversationId: z.string().min(1),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();
export type AssistantRuntimeMessageView = z.infer<typeof AssistantRuntimeMessageViewSchema>;

export const AssistantRuntimeHistoryViewSchema = z
  .object({
    conversationId: z.string().min(1),
    messages: z.array(AssistantRuntimeMessageViewSchema),
  })
  .strict();
export type AssistantRuntimeHistoryView = z.infer<typeof AssistantRuntimeHistoryViewSchema>;

export const AssistantRuntimeConversationDeleteResultSchema = z
  .object({ deleted: z.boolean() })
  .strict();
export type AssistantRuntimeConversationDeleteResult = z.infer<
  typeof AssistantRuntimeConversationDeleteResultSchema
>;

const RuntimeEventBaseShape = {
  eventId: z.string().min(1),
  runId: z.string().min(1),
  conversationId: z.string().min(1),
  sequence: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
} as const;

export const AssistantRuntimeEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.run.started'),
    data: z.object({
      modelId: z.string().min(1).optional(),
      providerId: z.string().min(1).optional(),
    }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.message.delta'),
    data: z.object({ content: z.string() }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.activity'),
    data: z.object({
      activityType: z.string().min(1),
      message: z.string().optional(),
    }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.usage.updated'),
    data: z.object({
      promptTokens: z.number().int().nonnegative().optional(),
      completionTokens: z.number().int().nonnegative().optional(),
      totalTokens: z.number().int().nonnegative().optional(),
      estimatedCost: z.number().nonnegative().optional(),
    }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.workflow.linked'),
    data: z.object({
      workflowRunId: z.string().min(1),
      kind: z.string().min(1),
    }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.run.completed'),
    data: z.object({
      content: z.string(),
      assistantMessageId: z.string().min(1).optional(),
    }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.run.failed'),
    data: z.object({
      code: z.string().min(1),
      message: z.string(),
    }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.run.cancelled'),
    data: z.object({ reason: z.string().optional() }),
  }),
]);
export type AssistantRuntimeEvent = z.infer<typeof AssistantRuntimeEventSchema>;

export const AIWorkflowKindSchema = z.enum(['goal.create', 'task.create', 'knowledge.capture']);
export type AIWorkflowKind = z.infer<typeof AIWorkflowKindSchema>;

export const AIWorkflowStatusSchema = z.enum([
  'running',
  'suspended',
  'completed',
  'failed',
  'cancelled',
]);
export type AIWorkflowStatus = z.infer<typeof AIWorkflowStatusSchema>;

export const AIWorkflowExecutionFailureSchema = z.discriminatedUnion('operation', [
  GoalPlanExecutionFailureSchema,
  TaskPlanExecutionFailureSchema,
  KnowledgeCaptureExecutionFailureSchema,
]);
export type AIWorkflowExecutionFailure = z.infer<typeof AIWorkflowExecutionFailureSchema>;

export const AIWorkflowSuspensionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('clarification_required'),
    questions: z.array(z.string().min(1)).min(1).max(3),
    round: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('goal_draft_review'),
    draft: GoalPlanDraftSchema,
    warnings: z.array(z.string()).default([]),
    revision: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('knowledge_draft_review'),
    draft: KnowledgeDraftSchema,
    warnings: z.array(z.string()).default([]),
    revision: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('task_draft_review'),
    draft: TaskPlanDraftSchema,
    warnings: z.array(z.string()).default([]),
    revision: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('recovery_required'),
    message: z.string().min(1),
    retryable: z.boolean(),
    failures: z.array(AIWorkflowExecutionFailureSchema).default([]),
  }),
]);
export type AIWorkflowSuspension = z.infer<typeof AIWorkflowSuspensionSchema>;

export const AIWorkflowResumeCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), answers: z.array(z.string().min(1)).min(1).max(3) }),
  z.object({ type: z.literal('approve') }),
  z.object({ type: z.literal('cancel') }),
  z.object({
    type: z.literal('edit_structured'),
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('revise_natural_language'),
    instruction: z.string().min(1),
  }),
  z.object({ type: z.literal('regenerate') }),
  z.object({ type: z.literal('retry') }),
  z.object({ type: z.literal('accept_partial') }),
  z.object({ type: z.literal('cancel_remaining') }),
]);
export type AIWorkflowResumeCommand = z.infer<typeof AIWorkflowResumeCommandSchema>;

const WorkflowStartBaseShape = {
  conversationId: z.string().min(1),
  providerId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  locale: z.enum(['zh-CN', 'en-US']).optional(),
  identityId: z.never().optional(),
} as const;

export const AIWorkflowStartClientRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...WorkflowStartBaseShape,
      kind: z.literal('goal.create'),
      input: GoalCreateClientInputSchema,
    })
    .strict(),
  z
    .object({
      ...WorkflowStartBaseShape,
      kind: z.literal('task.create'),
      input: TaskCreateClientInputSchema,
    })
    .strict(),
  z
    .object({
      ...WorkflowStartBaseShape,
      kind: z.literal('knowledge.capture'),
      input: KnowledgeCaptureClientInputSchema,
    })
    .strict(),
]);
export type AIWorkflowStartClientRequest = z.infer<typeof AIWorkflowStartClientRequestSchema>;

export const AIWorkflowResumeClientRequestSchema = z
  .object({
    runId: z.string().min(1),
    command: AIWorkflowResumeCommandSchema,
    identityId: z.never().optional(),
  })
  .strict();
export type AIWorkflowResumeClientRequest = z.infer<typeof AIWorkflowResumeClientRequestSchema>;

export const AIWorkflowGetClientRequestSchema = z
  .object({
    runId: z.string().min(1),
    identityId: z.never().optional(),
  })
  .strict();
export type AIWorkflowGetClientRequest = z.infer<typeof AIWorkflowGetClientRequestSchema>;

export const AIWorkflowListClientRequestSchema = z
  .object({
    conversationId: z.string().min(1).optional(),
    identityId: z.never().optional(),
  })
  .strict();
export type AIWorkflowListClientRequest = z.infer<typeof AIWorkflowListClientRequestSchema>;

export const AIWorkflowCancelClientRequestSchema = z
  .object({
    runId: z.string().min(1),
    identityId: z.never().optional(),
  })
  .strict();
export type AIWorkflowCancelClientRequest = z.infer<typeof AIWorkflowCancelClientRequestSchema>;

export const AIRuntimeUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  estimatedCost: z.number().nonnegative().optional(),
});
export type AIRuntimeUsage = z.infer<typeof AIRuntimeUsageSchema>;

export const AIRuntimeUsageQueryClientRequestSchema = z
  .object({
    conversationId: z.string().min(1).optional(),
    runId: z.string().min(1).optional(),
    identityId: z.never().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.conversationId || value.runId), {
    message: 'conversationId or runId is required',
  });
export type AIRuntimeUsageQueryClientRequest = z.infer<
  typeof AIRuntimeUsageQueryClientRequestSchema
>;

export const AIRuntimeUsageSummarySchema = AIRuntimeUsageSchema.extend({
  executionCount: z.number().int().nonnegative(),
});
export type AIRuntimeUsageSummary = z.infer<typeof AIRuntimeUsageSummarySchema>;

const WorkflowRunViewBaseShape = {
  runId: z.string().min(1),
  conversationId: z.string().min(1),
  status: AIWorkflowStatusSchema,
  suspension: AIWorkflowSuspensionSchema.optional(),
  usage: AIRuntimeUsageSchema.optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
} as const;

export const AIWorkflowRunViewSchema = z.discriminatedUnion('kind', [
  z.object({
    ...WorkflowRunViewBaseShape,
    kind: z.literal('goal.create'),
    result: GoalPlanExecutionReceiptSchema.optional(),
  }),
  z.object({
    ...WorkflowRunViewBaseShape,
    kind: z.literal('task.create'),
    result: TaskPlanExecutionReceiptSchema.optional(),
  }),
  z.object({
    ...WorkflowRunViewBaseShape,
    kind: z.literal('knowledge.capture'),
    result: KnowledgeCaptureExecutionReceiptSchema.optional(),
  }),
]);
export type AIWorkflowRunView = z.infer<typeof AIWorkflowRunViewSchema>;

export const AIWorkflowEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('workflow.started'),
    data: z.object({ kind: AIWorkflowKindSchema }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('workflow.suspended'),
    data: z.object({ suspension: AIWorkflowSuspensionSchema }),
  }),
  z.object({ ...RuntimeEventBaseShape, type: z.literal('workflow.resumed'), data: z.object({}) }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('workflow.usage.updated'),
    data: AIRuntimeUsageSchema,
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('workflow.completed'),
    data: z.object({ result: z.record(z.string(), z.unknown()).optional() }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('workflow.failed'),
    data: z.object({ code: z.string().min(1), message: z.string() }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('workflow.cancelled'),
    data: z.object({ reason: z.string().optional() }),
  }),
]);
export type AIWorkflowEvent = z.infer<typeof AIWorkflowEventSchema>;
