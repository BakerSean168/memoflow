import { AgentInstanceSlugSchema } from './local-agent.dto';
import { z } from 'zod';
import {
  FailureRetryHintSchema,
  FailureReferenceSchema,
  strictFailureDetails,
} from '@memoflow/transport-contracts/result';
import { CreateTaskPlanSchema } from '@memoflow/task-contracts';
import {
  GoalCreateClientInputSchema,
  GoalPlanDraftSchema,
  GoalWorkflowLiveActionJournalSchema,
  GoalPlanExecutionFailureSchema,
  GoalPlanExecutionReceiptSchema,
} from './ai-goal-create-workflow.dto';
import { GoalResearchEvidenceSchema } from './ai-goal-research.dto';
import {
  KnowledgeCaptureClientInputSchema,
  KnowledgeCaptureExecutionFailureSchema,
  KnowledgeCaptureExecutionReceiptSchema,
  KnowledgeDraftSchema,
} from './ai-knowledge-capture-workflow.dto';
import {
  TaskCreateClientInputSchema,
  TaskPlanDraftSchema,
  TaskPlanExecutionFailureSchema,
  TaskPlanExecutionReceiptSchema,
} from './ai-task-create-workflow.dto';

import { RuntimeEventBaseShape } from './runtime-event-base';
import { AIRuntimeUsageSchema } from './runtime-usage.dto';
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

const GoalWorkflowRecoveryReceiptSchema = z
  .object({ kind: z.literal('goal.create'), receipt: GoalPlanExecutionReceiptSchema })
  .strict();
const TaskWorkflowRecoveryReceiptSchema = z
  .object({ kind: z.literal('task.create'), receipt: TaskPlanExecutionReceiptSchema })
  .strict();
const KnowledgeWorkflowRecoveryReceiptSchema = z
  .object({ kind: z.literal('knowledge.capture'), receipt: KnowledgeCaptureExecutionReceiptSchema })
  .strict();
export const AIWorkflowRecoveryReceiptSchema = z.discriminatedUnion('kind', [
  GoalWorkflowRecoveryReceiptSchema,
  TaskWorkflowRecoveryReceiptSchema,
  KnowledgeWorkflowRecoveryReceiptSchema,
]);
export type AIWorkflowRecoveryReceipt = z.infer<typeof AIWorkflowRecoveryReceiptSchema>;

const AIWorkflowClarificationSchema = z.object({
  type: z.literal('clarification_required'),
  questions: z.array(z.string().min(1)).min(1).max(3),
  round: z.number().int().positive().optional(),
  candidateDraft: GoalPlanDraftSchema.optional(),
  researchEvidence: z.array(GoalResearchEvidenceSchema).max(8).optional(),
});

const GoalWorkflowDraftReviewSchema = z
  .object({
    type: z.literal('goal_draft_review'),
    draft: GoalPlanDraftSchema,
    warnings: z.array(z.string()).default([]),
    revision: z.number().int().positive(),
    researchEvidence: z.array(GoalResearchEvidenceSchema).max(8).optional(),
    ownerCreate: z
      .object({
        goalId: z.string().min(1),
        keyResultIds: z.record(z.string().regex(/^kr:/), z.string().min(1)),
      })
      .strict(),
  })
  .superRefine((suspension, ctx) => {
    const refs = suspension.draft.keyResults.map((item) => item.draftRef);
    const ids = suspension.ownerCreate.keyResultIds;
    if (
      suspension.revision !== suspension.draft.revision ||
      Object.keys(ids).length !== refs.length ||
      refs.some((ref) => !ids[ref]) ||
      new Set(Object.values(ids)).size !== refs.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Goal owner identity hints must cover exactly the current review revision and Key Results',
      });
    }
  });

const KnowledgeWorkflowDraftReviewSchema = z.object({
  type: z.literal('knowledge_draft_review'),
  draft: KnowledgeDraftSchema,
  warnings: z.array(z.string()).default([]),
  revision: z.number().int().positive(),
});

const TaskWorkflowDraftReviewSchema = z
  .object({
    type: z.literal('task_draft_review'),
    ownerCreate: z
      .object({
        taskId: CreateTaskPlanSchema.shape.id.unwrap(),
        draftRef: TaskPlanDraftSchema.shape.task.shape.draftRef,
      })
      .strict(),
    draft: TaskPlanDraftSchema,
    warnings: z.array(z.string()).default([]),
    revision: z.number().int().positive(),
  })
  .superRefine((suspension, ctx) => {
    if (
      suspension.revision !== suspension.draft.revision ||
      suspension.ownerCreate.draftRef !== suspension.draft.task.draftRef
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Task owner identity hints must match the current review revision and draftRef',
      });
    }
  });

const WorkflowRecoveryBaseSchema = z.object({
  type: z.literal('recovery_required'),
  message: z.string().min(1),
  retryable: z.boolean(),
  failures: z.array(AIWorkflowExecutionFailureSchema).default([]),
  // Optional for backward-compatible restore of snapshots created before
  // recovery receipts were projected into the public run view.
  receipt: AIWorkflowRecoveryReceiptSchema.optional(),
});

export const AIWorkflowSuspensionSchema = z.discriminatedUnion('type', [
  AIWorkflowClarificationSchema,
  GoalWorkflowDraftReviewSchema,
  KnowledgeWorkflowDraftReviewSchema,
  TaskWorkflowDraftReviewSchema,
  WorkflowRecoveryBaseSchema,
]);

export const GoalWorkflowSuspensionSchema = z.discriminatedUnion('type', [
  AIWorkflowClarificationSchema,
  GoalWorkflowDraftReviewSchema,
  WorkflowRecoveryBaseSchema.extend({
    failures: z.array(GoalPlanExecutionFailureSchema).default([]),
    receipt: GoalWorkflowRecoveryReceiptSchema.optional(),
  }),
]);

export const TaskWorkflowSuspensionSchema = z.discriminatedUnion('type', [
  AIWorkflowClarificationSchema,
  TaskWorkflowDraftReviewSchema,
  WorkflowRecoveryBaseSchema.extend({
    failures: z.array(TaskPlanExecutionFailureSchema).default([]),
    receipt: TaskWorkflowRecoveryReceiptSchema.optional(),
  }),
]);

export const KnowledgeWorkflowSuspensionSchema = z.discriminatedUnion('type', [
  AIWorkflowClarificationSchema,
  KnowledgeWorkflowDraftReviewSchema,
  WorkflowRecoveryBaseSchema.extend({
    failures: z.array(KnowledgeCaptureExecutionFailureSchema).default([]),
    receipt: KnowledgeWorkflowRecoveryReceiptSchema.optional(),
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
  agentInstanceId: AgentInstanceSlugSchema.optional(),
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
      workflowTurn: z.string().trim().min(1).max(200000).optional(),
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
    workflowTurn: z.string().trim().min(1).max(200000).optional(),
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

/** Server-issued Goal native-panel lease token; identity always comes from auth. */
export const AIGoalSurfaceLeaseRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('claim'),
      runId: z.string().min(1),
      identityId: z.never().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('renew'),
      runId: z.string().min(1),
      token: z.string().uuid(),
      fence: z.number().int().positive(),
      identityId: z.never().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('release'),
      runId: z.string().min(1),
      token: z.string().uuid(),
      fence: z.number().int().positive(),
      identityId: z.never().optional(),
    })
    .strict(),
]);
export type AIGoalSurfaceLeaseRequest = z.infer<typeof AIGoalSurfaceLeaseRequestSchema>;

export const AIGoalSurfaceLeaseResponseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('claimed'),
      token: z.string().uuid(),
      fence: z.number().int().positive(),
      expiresAt: z.number().int().positive(),
    })
    .strict(),
  z.object({ status: z.literal('busy') }).strict(),
  z.object({ status: z.literal('renewed'), expiresAt: z.number().int().positive() }).strict(),
  z.object({ status: z.literal('lost') }).strict(),
  z.object({ status: z.literal('released') }).strict(),
]);
export type AIGoalSurfaceLeaseResponse = z.infer<typeof AIGoalSurfaceLeaseResponseSchema>;

export const AIWorkflowCancelClientRequestSchema = z
  .object({
    runId: z.string().min(1),
    identityId: z.never().optional(),
  })
  .strict();
export type AIWorkflowCancelClientRequest = z.infer<typeof AIWorkflowCancelClientRequestSchema>;

export const AIRateLimitDetailsSchema = strictFailureDetails({
  limitKind: z.enum(['rate_limit', 'quota_exhausted', 'unknown']),
});
export const AIRateLimitPublicFailureSchema = z
  .object({
    code: z.literal('RATE_LIMITED'),
    category: z.literal('rate_limited'),
    details: AIRateLimitDetailsSchema.optional(),
    retryHint: FailureRetryHintSchema.optional(),
    reference: FailureReferenceSchema.optional(),
  })
  .strict();

export const AIWorkflowTerminalFailureSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: AIRateLimitDetailsSchema.optional(),
    retryHint: FailureRetryHintSchema.optional(),
  })
  .strict()
  .refine((failure) => !failure.details || failure.code === 'RATE_LIMITED', {
    message: 'Rate-limit details require RATE_LIMITED',
  });
export type AIWorkflowTerminalFailure = z.infer<typeof AIWorkflowTerminalFailureSchema>;

const WorkflowRunViewBaseShape = {
  runId: z.string().min(1),
  conversationId: z.string().min(1),
  status: AIWorkflowStatusSchema,
  startRequestId: z.string().uuid().optional(),
  /** Version of the committed workflow projection, independent of draft revision and lease fence. */
  resourceVersion: z.number().int().positive().optional(),
  failure: AIWorkflowTerminalFailureSchema.optional(),
  usage: AIRuntimeUsageSchema.optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
} as const;

export const AIWorkflowRunViewSchema = z.discriminatedUnion('kind', [
  z.object({
    ...WorkflowRunViewBaseShape,
    kind: z.literal('goal.create'),
    /** A detached resume acknowledgement waits for a newer committed state than this version. */
    awaitAfterVersion: z.number().int().positive().optional(),
    suspension: GoalWorkflowSuspensionSchema.optional(),
    liveActions: GoalWorkflowLiveActionJournalSchema.optional(),
    result: GoalPlanExecutionReceiptSchema.optional(),
  }),
  z.object({
    ...WorkflowRunViewBaseShape,
    kind: z.literal('task.create'),
    suspension: TaskWorkflowSuspensionSchema.optional(),
    result: TaskPlanExecutionReceiptSchema.optional(),
  }),
  z.object({
    ...WorkflowRunViewBaseShape,
    kind: z.literal('knowledge.capture'),
    suspension: KnowledgeWorkflowSuspensionSchema.optional(),
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
