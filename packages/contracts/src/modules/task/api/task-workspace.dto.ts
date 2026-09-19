import { z } from 'zod';
import type { GoalId, KeyResultId, TaskPlanId } from '../../../primitives';
import { brandedId } from '../../../primitives';
import { KnowledgeDocumentIdSchema, KnowledgeDocumentRefSchema } from '../../repository';
import { GoalClientDTOSchema, KeyResultClientDTOSchema } from '../../goal/api/response-schemas';
import { TaskOccurrenceResponseSchema, TaskPlanResponseSchema } from './response-schemas';
import { LabelClientDTOSchema } from '../../label';

export const GetTaskWorkspaceReqSchema = z.object({
  recentLimit: z.coerce.number().int().min(1).max(20).default(5),
}).strict();
export type GetTaskWorkspaceReq = z.input<typeof GetTaskWorkspaceReqSchema>;

export const GetTaskWorkspaceInvocationSchema = GetTaskWorkspaceReqSchema.extend({
  planId: brandedId<TaskPlanId>(),
}).strict();
export type GetTaskWorkspaceInvocation = z.input<typeof GetTaskWorkspaceInvocationSchema>;

export const TaskWorkspaceOccurrenceSummarySchema = z.object({
  total: z.number().int().min(0),
  completed: z.number().int().min(0),
  missed: z.number().int().min(0),
  skipped: z.number().int().min(0),
  pending: z.number().int().min(0),
  inProgress: z.number().int().min(0),
  completionRate: z.number().int().min(0).max(100),
}).strict();

const goalContextBase = z.object({ goalId: brandedId<GoalId>(), keyResultId: brandedId<KeyResultId>().nullable() }).strict();
export const TaskWorkspaceGoalContextSchema = z.discriminatedUnion('availability', [
  goalContextBase.extend({
    availability: z.literal('Available'),
    goal: GoalClientDTOSchema,
    keyResult: KeyResultClientDTOSchema.nullable(),
  }).strict(),
  goalContextBase.extend({ availability: z.literal('Missing'), goal: z.null(), keyResult: z.null() }).strict(),
  goalContextBase.extend({ availability: z.literal('Unavailable'), goal: z.null(), keyResult: z.null() }).strict(),
]);

const noteBase = z.object({
  relationId: z.string().min(1),
  documentId: KnowledgeDocumentIdSchema,
  linkedAt: z.number().finite(),
});
export const TaskWorkspaceLinkedNoteSchema = z.discriminatedUnion('state', [
  noteBase.extend({
    state: z.literal('Resolved'),
    documentRef: KnowledgeDocumentRefSchema,
    title: z.string().min(1), excerpt: z.string(), relativePath: z.string().min(1), updatedAt: z.number().finite(),
  }).strict(),
  noteBase.extend({
    state: z.literal('Missing'),
    title: z.null(), excerpt: z.null(), relativePath: z.null(), updatedAt: z.null(),
  }).strict(),
]);

export const TaskPlanWorkspaceSchema = z.object({
  plan: TaskPlanResponseSchema,
  labels: z.array(LabelClientDTOSchema),
  goalContext: TaskWorkspaceGoalContextSchema.nullable(),
  occurrenceSummary: TaskWorkspaceOccurrenceSummarySchema,
  recentOccurrences: z.array(TaskOccurrenceResponseSchema),
  linkedNotes: z.array(TaskWorkspaceLinkedNoteSchema),
}).strict();
export type TaskPlanWorkspace = z.infer<typeof TaskPlanWorkspaceSchema>;
