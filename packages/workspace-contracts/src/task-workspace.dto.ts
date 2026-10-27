/**
 * Task Workspace composition contract (ADR-075 / Issue #635 §三).
 *
 * This is cross-domain assembly, so it lives in the neutral workspace package
 * rather than in either business domain: `task` owns the plan/occurrence
 * projections, `goal` owns the Goal/KeyResult references and the host wires the
 * Goal read port. Availability always retains the binding ids; the `Available`
 * branch carries only what a Task surface renders, never the Goal aggregate.
 */
import { z } from 'zod';
import type { TaskPlanId } from '@memoflow/task-contracts';
import type { GoalId, KeyResultId } from '@memoflow/goal-contracts';
import { brandedId } from '@memoflow/shared-primitives';
import {
  KnowledgeDocumentIdSchema,
  KnowledgeDocumentRefSchema,
} from '@memoflow/repository-contracts';
import { GoalReferenceSchema, KeyResultReferenceSchema } from '@memoflow/goal-contracts';
import { TaskOccurrenceResponseSchema, TaskPlanResponseSchema } from '@memoflow/task-contracts';
import { LabelClientDTOSchema } from '@memoflow/label-contracts';

export const GetTaskWorkspaceReqSchema = z
  .object({
    recentLimit: z.coerce.number().int().min(1).max(20).default(5),
  })
  .strict();
export type GetTaskWorkspaceReq = z.input<typeof GetTaskWorkspaceReqSchema>;

export const GetTaskWorkspaceInvocationSchema = GetTaskWorkspaceReqSchema.extend({
  planId: brandedId<TaskPlanId>(),
}).strict();
export type GetTaskWorkspaceInvocation = z.input<typeof GetTaskWorkspaceInvocationSchema>;

export const TaskWorkspaceOccurrenceSummarySchema = z
  .object({
    total: z.number().int().min(0),
    completed: z.number().int().min(0),
    missed: z.number().int().min(0),
    skipped: z.number().int().min(0),
    pending: z.number().int().min(0),
    inProgress: z.number().int().min(0),
    completionRate: z.number().int().min(0).max(100),
  })
  .strict();

const goalContextBase = z
  .object({ goalId: brandedId<GoalId>(), keyResultId: brandedId<KeyResultId>().nullable() })
  .strict();
export const TaskWorkspaceGoalContextSchema = z.discriminatedUnion('availability', [
  goalContextBase
    .extend({
      availability: z.literal('Available'),
      goal: GoalReferenceSchema,
      keyResult: KeyResultReferenceSchema.nullable(),
    })
    .strict(),
  goalContextBase
    .extend({ availability: z.literal('Missing'), goal: z.null(), keyResult: z.null() })
    .strict(),
  goalContextBase
    .extend({ availability: z.literal('Unavailable'), goal: z.null(), keyResult: z.null() })
    .strict(),
]);

const noteBase = z.object({
  relationId: z.string().min(1),
  documentId: KnowledgeDocumentIdSchema,
  linkedAt: z.number().finite(),
});
export const TaskWorkspaceLinkedNoteSchema = z.discriminatedUnion('state', [
  noteBase
    .extend({
      state: z.literal('Resolved'),
      documentRef: KnowledgeDocumentRefSchema,
      title: z.string().min(1),
      excerpt: z.string(),
      relativePath: z.string().min(1),
      updatedAt: z.number().finite(),
    })
    .strict(),
  noteBase
    .extend({
      state: z.literal('Missing'),
      title: z.null(),
      excerpt: z.null(),
      relativePath: z.null(),
      updatedAt: z.null(),
    })
    .strict(),
]);

export const TaskPlanWorkspaceSchema = z
  .object({
    plan: TaskPlanResponseSchema,
    labels: z.array(LabelClientDTOSchema),
    goalContext: TaskWorkspaceGoalContextSchema.nullable(),
    occurrenceSummary: TaskWorkspaceOccurrenceSummarySchema,
    recentOccurrences: z.array(TaskOccurrenceResponseSchema),
    linkedNotes: z.array(TaskWorkspaceLinkedNoteSchema),
  })
  .strict();
export type TaskPlanWorkspace = z.infer<typeof TaskPlanWorkspaceSchema>;
