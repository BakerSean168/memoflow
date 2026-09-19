import { z } from 'zod';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import { TaskGoalLinkSchema, TaskPlanScheduleSchema, TaskReminderConfigSchema } from '../../task';

/**
 * Canonical product contract for ADR-052-style `task.create` Mastra Workflow.
 *
 * Mirrors `goal.create` conventions: typed, deterministic, safe to persist in
 * Mastra snapshots and to project to HTTP/IPC clients. No credentials, provider
 * configuration or framework-private workflow state belongs here, and the
 * client schema rejects any client-supplied identityId.
 */

export const TaskCreateClientInputSchema = z
  .object({
    idea: z.string().trim().min(1).max(8000),
    goalId: z.string().trim().min(1).optional(),
    surfaceContext: z
      .object({
        currentRoute: z.string().trim().max(500).optional(),
        timezone: z.string().trim().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type TaskCreateClientInput = z.infer<typeof TaskCreateClientInputSchema>;

export const TaskCreateWorkflowInputSchema = TaskCreateClientInputSchema.extend({
  identityId: z.string().min(1),
  conversationId: z.string().min(1),
  locale: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  providerId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
}).strict();
export type TaskCreateWorkflowInput = z.infer<typeof TaskCreateWorkflowInputSchema>;

const draftRefSlug = '[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?';
export const TaskPlanDraftRefSchema = z.string().regex(new RegExp(`^task:${draftRefSlug}$`));
export type TaskPlanDraftRef = z.infer<typeof TaskPlanDraftRefSchema>;

/**
 * Task owner link semantics projected into the standalone AI draft.
 * `TaskGoalLinkSchema` remains the owner contract; the local strict wrapper
 * only prevents AI-only fields from entering the workflow snapshot.
 */
const TaskPlanGoalBindingSchema = TaskGoalLinkSchema.strict().superRefine((value, ctx) => {
  if (value.contribution && !value.keyResultId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['keyResultId'],
      message: 'Task contribution requires a Key Result link',
    });
  }
});

export const TaskPlanTaskSchema = z
  .object({
    draftRef: TaskPlanDraftRefSchema,
    title: z.string().trim().min(1).max(256),
    description: z.string().trim().max(2000).nullable().optional(),
    importance: z.enum(ImportanceLevel).default(ImportanceLevel.Moderate),
    schedule: TaskPlanScheduleSchema,
    reminderConfig: TaskReminderConfigSchema.nullable().optional().default(null),
    goalBinding: TaskPlanGoalBindingSchema.nullable().optional().default(null),
    labels: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
  })
  .strict();
export type TaskPlanTask = z.infer<typeof TaskPlanTaskSchema>;

export const TaskPlanDraftContentSchema = z
  .object({
    task: TaskPlanTaskSchema,
    rationale: z.string().trim().max(4000).default(''),
    warnings: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
  })
  .strict();
export type TaskPlanDraftContent = z.infer<typeof TaskPlanDraftContentSchema>;

export const TaskPlanDraftSchema = TaskPlanDraftContentSchema.extend({
  revision: z.number().int().positive(),
}).strict();
export type TaskPlanDraft = z.infer<typeof TaskPlanDraftSchema>;

export const TaskPlanningDecisionSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('draft_ready'),
      reason: z.string().trim().min(1).max(2000),
      candidateDraft: TaskPlanDraftContentSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('needs_clarification'),
      reason: z.string().trim().min(1).max(2000),
      questions: z.array(z.string().trim().min(1).max(500)).min(1).max(3),
      candidateDraft: TaskPlanDraftContentSchema.optional(),
    })
    .strict(),
]);
export type TaskPlanningDecision = z.infer<typeof TaskPlanningDecisionSchema>;

export const TaskClarificationRoundSchema = z
  .object({
    round: z.number().int().positive().max(3),
    questions: z.array(z.string().min(1)).min(1).max(3),
    answers: z.array(z.string().min(1)).min(1).max(3),
  })
  .strict();
export type TaskClarificationRound = z.infer<typeof TaskClarificationRoundSchema>;

export const TaskClarificationStateSchema = z
  .object({
    rounds: z.array(TaskClarificationRoundSchema).max(3).default([]),
  })
  .strict();
export type TaskClarificationState = z.infer<typeof TaskClarificationStateSchema>;

export const TaskPlanExecutionFailureSchema = z
  .object({
    operation: z.literal('task_plan'),
    draftRef: TaskPlanDraftRefSchema,
    code: z.string().min(1),
    message: z.string(),
    retryable: z.boolean(),
  })
  .strict();
export type TaskPlanExecutionFailure = z.infer<typeof TaskPlanExecutionFailureSchema>;

export const TaskPlanExecutionReceiptSchema = z
  .object({
    workflowRunId: z.string().min(1),
    revision: z.number().int().positive(),
    status: z.enum(['success', 'partial', 'failed']),
    referenceMap: z.record(TaskPlanDraftRefSchema, z.string().min(1)).default({}),
    failures: z.array(TaskPlanExecutionFailureSchema).default([]),
    retryable: z.boolean(),
  })
  .strict();
export type TaskPlanExecutionReceipt = z.infer<typeof TaskPlanExecutionReceiptSchema>;
