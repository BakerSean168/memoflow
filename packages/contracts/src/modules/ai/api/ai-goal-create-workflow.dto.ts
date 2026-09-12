import { z } from 'zod';
import { YmdSchema } from '../../../primitives';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import { GoalTimeframeSchema, KeyResultCalculationMethod } from '../../goal';
import { KnowledgeDocumentRefSchema } from '../../repository';
import {
  GoalContributionRuleSchema,
  TaskPlanScheduleSchema,
  TaskReminderConfigSchema,
} from '../../task';

/**
 * Canonical product contract for the durable `goal.create` Workflow.
 *
 * GOAL-7208 / ADR-070 / ADR-099: drafts are reviewed multi-entity plans over
 * owner-domain vocabulary. Array positions are presentation only; every child
 * owns a stable workflow-local `draftRef`, and no legacy Goal/Task/Reminder DSL
 * is accepted here.
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

const draftRefSlug = '[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?';
export const GoalDraftRefSchema = z.literal('goal');
export const GoalPlanKeyResultDraftRefSchema = z.string().regex(new RegExp(`^kr:${draftRefSlug}$`));
export const GoalPlanTaskDraftRefSchema = z.string().regex(new RegExp(`^task:${draftRefSlug}$`));
export const GoalPlanKnowledgeDraftRefSchema = z
  .string()
  .regex(new RegExp(`^note:${draftRefSlug}$`));
export const GoalPlanDraftRefSchema = z.union([
  GoalDraftRefSchema,
  GoalPlanKeyResultDraftRefSchema,
  GoalPlanTaskDraftRefSchema,
  GoalPlanKnowledgeDraftRefSchema,
]);
export type GoalPlanDraftRef = z.infer<typeof GoalPlanDraftRefSchema>;

const LabelNameSchema = z.string().trim().min(1).max(50);

export const GoalPlanGoalSchema = z
  .object({
    draftRef: GoalDraftRefSchema,
    name: z.string().trim().min(1).max(256),
    summary: z.string().trim().max(500).nullable().optional(),
    status: z.enum(['Planned', 'InProgress']).default('Planned'),
    startDate: YmdSchema.nullable().optional(),
    target: GoalTimeframeSchema.nullable().optional(),
    labels: z.array(LabelNameSchema).max(50).default([]),
  })
  .strict();
export type GoalPlanGoal = z.infer<typeof GoalPlanGoalSchema>;

export const GoalPlanKeyResultSchema = z
  .object({
    draftRef: GoalPlanKeyResultDraftRefSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    aggregationMethod: z.enum(KeyResultCalculationMethod).default(KeyResultCalculationMethod.Sum),
    initialValue: z.number().default(0),
    currentValue: z.number().optional(),
    targetValue: z.number(),
    target: GoalTimeframeSchema.nullable().optional(),
    unit: z.string().trim().max(20).nullable().optional(),
    weight: z.number().int().min(1).max(5).default(3),
  })
  .strict()
  .transform((value) => ({
    ...value,
    currentValue: value.currentValue ?? value.initialValue,
  }));
export type GoalPlanKeyResult = z.infer<typeof GoalPlanKeyResultSchema>;

export const GoalPlanTaskSchema = z
  .object({
    draftRef: GoalPlanTaskDraftRefSchema,
    title: z.string().trim().min(1).max(256),
    description: z.string().trim().max(2000).nullable().optional(),
    importance: z.enum(ImportanceLevel).default(ImportanceLevel.Moderate),
    schedule: TaskPlanScheduleSchema,
    reminderConfig: TaskReminderConfigSchema.nullable().optional(),
    labels: z.array(LabelNameSchema).max(50).default([]),
    goalRef: GoalDraftRefSchema,
    keyResultRef: GoalPlanKeyResultDraftRefSchema.nullable().optional(),
    contribution: GoalContributionRuleSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.contribution && !value.keyResultRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['keyResultRef'],
        message: 'Task contribution requires a Key Result draftRef',
      });
    }
  });
export type GoalPlanTask = z.infer<typeof GoalPlanTaskSchema>;

const GoalPlanKnowledgeTargetPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.startsWith('\\\\') &&
      !/^[a-zA-Z]:/.test(value) &&
      !value.split('/').some((part) => part === '..') &&
      value.toLowerCase().endsWith('.md'),
    { message: 'Knowledge target path must be a vault-relative Markdown path' },
  );

export const GoalPlanKnowledgeCreateSchema = z
  .object({
    draftRef: GoalPlanKnowledgeDraftRefSchema,
    mode: z.literal('create'),
    title: z.string().trim().min(1).max(256),
    markdown: z.string().trim().min(1).max(40000),
    targetSubpath: GoalPlanKnowledgeTargetPathSchema,
    sourceRefs: z.array(z.string().trim().min(1).max(2000)).max(50).default([]),
  })
  .strict();

export const GoalPlanKnowledgeLinkExistingSchema = z
  .object({
    draftRef: GoalPlanKnowledgeDraftRefSchema,
    mode: z.literal('linkExisting'),
    knowledgeDocument: KnowledgeDocumentRefSchema,
    title: z.string().trim().min(1).max(256),
  })
  .strict();

export const GoalPlanKnowledgeSchema = z.discriminatedUnion('mode', [
  GoalPlanKnowledgeCreateSchema,
  GoalPlanKnowledgeLinkExistingSchema,
]);
export type GoalPlanKnowledge = z.infer<typeof GoalPlanKnowledgeSchema>;

export const GoalPlanDraftContentSchema = z
  .object({
    goal: GoalPlanGoalSchema,
    keyResults: z.array(GoalPlanKeyResultSchema).max(50).default([]),
    tasks: z.array(GoalPlanTaskSchema).max(50).default([]),
    knowledge: z.array(GoalPlanKnowledgeSchema).max(50).default([]),
    rationale: z.string().trim().max(4000).default(''),
    warnings: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const refs = new Set<string>();
    const addRef = (ref: string, path: (string | number)[]) => {
      if (refs.has(ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `Duplicate draftRef: ${ref}`,
        });
      }
      refs.add(ref);
    };
    addRef(value.goal.draftRef, ['goal', 'draftRef']);
    value.keyResults.forEach((item, index) =>
      addRef(item.draftRef, ['keyResults', index, 'draftRef']),
    );
    value.tasks.forEach((item, index) => addRef(item.draftRef, ['tasks', index, 'draftRef']));
    value.knowledge.forEach((item, index) =>
      addRef(item.draftRef, ['knowledge', index, 'draftRef']),
    );

    const keyResultRefs = new Set(value.keyResults.map((item) => item.draftRef));
    value.tasks.forEach((task, index) => {
      if (task.keyResultRef && !keyResultRefs.has(task.keyResultRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tasks', index, 'keyResultRef'],
          message: `Task keyResultRef does not exist in this draft: ${task.keyResultRef}`,
        });
      }
    });
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
    operation: z.enum([
      'label_resolve',
      'goal_create',
      'goal_activate',
      'knowledge_create',
      'knowledge_link',
      'task_create',
    ]),
    draftRef: GoalPlanDraftRefSchema,
    code: z.string().min(1),
    message: z.string(),
    retryable: z.boolean(),
  })
  .strict();
export type GoalPlanExecutionFailure = z.infer<typeof GoalPlanExecutionFailureSchema>;

/**
 * Durable V2 apply receipt. `referenceMap` is the only draftRef -> persistent
 * entity map; arrays/indexes are deliberately absent so reorder cannot change
 * retry identity. Knowledge Relation ids are mutation receipts rather than
 * entity identities and therefore live in a separate map.
 */
export const GoalPlanExecutionReceiptSchema = z
  .object({
    workflowRunId: z.string().min(1),
    revision: z.number().int().positive(),
    status: z.enum(['success', 'partial', 'failed']),
    referenceMap: z.record(GoalPlanDraftRefSchema, z.string().min(1)).default({}),
    relationIds: z.record(GoalPlanKnowledgeDraftRefSchema, z.string().min(1)).default({}),
    goalVersion: z.number().int().positive().optional(),
    appliedGoalStatus: z.enum(['Planned', 'InProgress']).optional(),
    failures: z.array(GoalPlanExecutionFailureSchema).default([]),
    retryable: z.boolean(),
  })
  .strict();
export type GoalPlanExecutionReceipt = z.infer<typeof GoalPlanExecutionReceiptSchema>;
