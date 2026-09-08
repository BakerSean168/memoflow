import { z } from 'zod';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import { KeyResultCalculationMethod } from '../../goal/value-objects/key-result-calculation-method';
import { NotificationChannel } from '../../reminder/value-objects/notification-channel';

/**
 * Canonical product contract for ADR-052 `goal.create`.
 *
 * These shapes are deliberately independent from the retired Goal AgentAction /
 * Proposal protocol. They are safe to persist in Mastra workflow snapshots and
 * to project to HTTP/IPC clients: no credentials, provider configuration or
 * framework-private workflow state is allowed here.
 */

export const GoalCreateClientInputSchema = z
  .object({
    idea: z.string().trim().min(1).max(8000),
    surfaceContext: z
      .object({
        currentRoute: z.string().trim().max(500).optional(),
        timezone: z.string().trim().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type GoalCreateClientInput = z.infer<typeof GoalCreateClientInputSchema>;

export const GoalCreateWorkflowInputSchema = GoalCreateClientInputSchema.extend({
  identityId: z.string().min(1),
  conversationId: z.string().min(1),
  locale: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  providerId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
}).strict();
export type GoalCreateWorkflowInput = z.infer<typeof GoalCreateWorkflowInputSchema>;

export const GoalPlanGoalSchema = z
  .object({
    name: z.string().trim().min(1).max(256),
    description: z.string().trim().max(2000).default(''),
    motivation: z.string().trim().max(2000).optional(),
    feasibilityAnalysis: z.string().trim().max(2000).optional(),
    startDate: z.number().int().nonnegative().nullable().default(null),
    dueDate: z.number().int().nonnegative().nullable().default(null),
    labels: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.startDate != null && value.dueDate != null && value.startDate > value.dueDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDate'],
        message: 'Goal dueDate must not be earlier than startDate',
      });
    }
  });
export type GoalPlanGoal = z.infer<typeof GoalPlanGoalSchema>;

export const GoalPlanKeyResultSchema = z
  .object({
    title: z.string().trim().min(1).max(256),
    description: z.string().trim().max(2000).optional(),
    calculationMethod: z.enum(KeyResultCalculationMethod),
    startingValue: z.number().default(0),
    progressBaselineValue: z.number().nullable().default(null),
    currentValue: z.number().default(0),
    targetValue: z.number(),
    unit: z.string().trim().max(50).default(''),
    weight: z.number().int().min(1).max(5),
  })
  .strict();
export type GoalPlanKeyResult = z.infer<typeof GoalPlanKeyResultSchema>;

export const GoalPlanCadenceSchema = z.enum(['daily', 'weekly', 'once']);
export type GoalPlanCadence = z.infer<typeof GoalPlanCadenceSchema>;

const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const GoalPlanTaskPlanSchema = z
  .object({
    name: z.string().trim().min(1).max(256),
    description: z.string().trim().max(2000).optional(),
    importance: z.enum(ImportanceLevel).default(ImportanceLevel.Moderate),
    cadence: GoalPlanCadenceSchema,
    startDate: z.number().int().nonnegative().nullable().optional(),
    timeOfDay: TimeOfDaySchema.optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    occurrences: z.number().int().positive().nullable().default(null),
    keyResultIndex: z.number().int().nonnegative().optional(),
    contributionValue: z.number().nonnegative().default(1),
    labels: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.cadence === 'weekly' && value.daysOfWeek.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['daysOfWeek'],
        message: 'Weekly task templates require at least one dayOfWeek',
      });
    }
  });
export type GoalPlanTaskPlan = z.infer<typeof GoalPlanTaskPlanSchema>;

export const GoalPlanReminderSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).optional(),
    importance: z.enum(ImportanceLevel).default(ImportanceLevel.Moderate),
    cadence: GoalPlanCadenceSchema,
    scheduledAt: z.number().int().nonnegative().nullable().optional(),
    timeOfDay: TimeOfDaySchema.optional(),
    timezone: z.string().trim().min(1).max(100).nullable().default(null),
    channels: z.array(z.enum(NotificationChannel)).min(1).default([NotificationChannel.InApp]),
    tags: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.cadence === 'once' && value.scheduledAt == null && !value.timeOfDay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledAt'],
        message: 'One-time reminders require scheduledAt or timeOfDay',
      });
    }
  });
export type GoalPlanReminder = z.infer<typeof GoalPlanReminderSchema>;

export const GoalPlanDraftContentSchema = z
  .object({
    goal: GoalPlanGoalSchema,
    keyResults: z.array(GoalPlanKeyResultSchema).max(50).default([]),
    taskPlans: z.array(GoalPlanTaskPlanSchema).max(50).default([]),
    reminders: z.array(GoalPlanReminderSchema).max(50).default([]),
    rationale: z.string().trim().max(4000).default(''),
    warnings: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const [index, task] of value.taskPlans.entries()) {
      if (task.keyResultIndex != null && task.keyResultIndex >= value.keyResults.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['taskPlans', index, 'keyResultIndex'],
          message: 'Task keyResultIndex must reference an existing key result',
        });
      }
    }
  });
export type GoalPlanDraftContent = z.infer<typeof GoalPlanDraftContentSchema>;

export const GoalPlanDraftSchema = GoalPlanDraftContentSchema.extend({
  revision: z.number().int().positive(),
}).strict();
export type GoalPlanDraft = z.infer<typeof GoalPlanDraftSchema>;

export const GoalPlanningDecisionSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('draft_ready'),
      reason: z.string().trim().min(1).max(2000),
      candidateDraft: GoalPlanDraftContentSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('needs_clarification'),
      reason: z.string().trim().min(1).max(2000),
      questions: z.array(z.string().trim().min(1).max(500)).min(1).max(3),
      candidateDraft: GoalPlanDraftContentSchema.optional(),
    })
    .strict(),
]);
export type GoalPlanningDecision = z.infer<typeof GoalPlanningDecisionSchema>;

export const GoalClarificationRoundSchema = z
  .object({
    round: z.number().int().positive().max(3),
    questions: z.array(z.string().min(1)).min(1).max(3),
    answers: z.array(z.string().min(1)).min(1).max(3),
  })
  .strict();
export type GoalClarificationRound = z.infer<typeof GoalClarificationRoundSchema>;

export const GoalClarificationStateSchema = z
  .object({
    rounds: z.array(GoalClarificationRoundSchema).max(3).default([]),
  })
  .strict();
export type GoalClarificationState = z.infer<typeof GoalClarificationStateSchema>;

export const GoalPlanExecutionFailureSchema = z
  .object({
    operation: z.enum(['goal', 'task_template', 'reminder']),
    index: z.number().int().nonnegative().optional(),
    code: z.string().min(1),
    message: z.string(),
    retryable: z.boolean(),
  })
  .strict();
export type GoalPlanExecutionFailure = z.infer<typeof GoalPlanExecutionFailureSchema>;

export const GoalPlanExecutionReceiptSchema = z
  .object({
    workflowRunId: z.string().min(1),
    revision: z.number().int().positive(),
    status: z.enum(['success', 'partial', 'failed']),
    goalId: z.string().min(1).optional(),
    keyResultIds: z.array(z.string().min(1)).default([]),
    taskIds: z.array(z.string().min(1)).default([]),
    reminderIds: z.array(z.string().min(1)).default([]),
    failures: z.array(GoalPlanExecutionFailureSchema).default([]),
    retryable: z.boolean(),
  })
  .strict();
export type GoalPlanExecutionReceipt = z.infer<typeof GoalPlanExecutionReceiptSchema>;
