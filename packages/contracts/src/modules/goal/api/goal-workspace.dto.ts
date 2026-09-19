import { z } from 'zod';
import type { GoalId, KnowledgeSpaceId } from '../../../primitives';
import { brandedId } from '../../../primitives/zod-extensions';
import { KnowledgeDocumentIdSchema } from '../../repository';
import {
  TaskGoalContextItemSchema,
  TaskGoalContextPageSchema,
  TaskGoalContextSummarySchema,
} from '../../task';
import {
  GoalClientDTOSchema,
  GoalRecordClientDTOSchema,
  GoalReviewClientDTOSchema,
} from './response-schemas';

/** Bounded pagination used by Goal Workspace context collections. */
export const GoalWorkspacePageRequestSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
export type GoalWorkspacePageRequest = z.input<typeof GoalWorkspacePageRequestSchema>;

export const GoalWorkspaceKnowledgePageInvocationSchema = GoalWorkspacePageRequestSchema.extend({
  goalId: brandedId<GoalId>(),
});
export type GoalWorkspaceKnowledgePageInvocation = z.input<
  typeof GoalWorkspaceKnowledgePageInvocationSchema
>;

/** Workspace first-paint tuning. Full collections always use paginated queries. */
export const GetGoalWorkspaceReqSchema = z
  .object({
    previewLimit: z.coerce.number().int().min(1).max(10).default(5),
    recentLimit: z.coerce.number().int().min(1).max(20).default(5),
  })
  .strict();
export type GetGoalWorkspaceReq = z.input<typeof GetGoalWorkspaceReqSchema>;

export const GetGoalWorkspaceInvocationSchema = GetGoalWorkspaceReqSchema.extend({
  goalId: brandedId<GoalId>(),
});
export type GetGoalWorkspaceInvocation = z.input<typeof GetGoalWorkspaceInvocationSchema>;

export const GoalWorkspaceTaskPageRequestSchema = GoalWorkspacePageRequestSchema.extend({
  keyResultId: z.string().min(1).optional(),
});
export type GoalWorkspaceTaskPageRequest = z.input<typeof GoalWorkspaceTaskPageRequestSchema>;

export const GoalWorkspaceTaskPageInvocationSchema = GoalWorkspaceTaskPageRequestSchema.extend({
  goalId: brandedId<GoalId>(),
});
export type GoalWorkspaceTaskPageInvocation = z.input<typeof GoalWorkspaceTaskPageInvocationSchema>;

export const GoalWorkspaceTaskPageSchema = TaskGoalContextPageSchema;
export type GoalWorkspaceTaskPage = z.infer<typeof GoalWorkspaceTaskPageSchema>;

const knowledgeItemBase = z.object({
  relationId: z.string().min(1),
  documentId: KnowledgeDocumentIdSchema,
  linkedAt: z.number().finite(),
});

export const GoalWorkspaceKnowledgeItemSchema = z.discriminatedUnion('state', [
  knowledgeItemBase
    .extend({
      state: z.literal('Resolved'),
      knowledgeSpaceId: brandedId<KnowledgeSpaceId>(),
      title: z.string().min(1),
      excerpt: z.string(),
      relativePath: z.string().min(1),
      updatedAt: z.number().finite(),
    })
    .strict(),
  knowledgeItemBase
    .extend({
      state: z.literal('Missing'),
      knowledgeSpaceId: z.null(),
      title: z.null(),
      excerpt: z.null(),
      relativePath: z.null(),
      updatedAt: z.null(),
    })
    .strict(),
]);
export type GoalWorkspaceKnowledgeItem = z.infer<typeof GoalWorkspaceKnowledgeItemSchema>;

export const GoalWorkspaceKnowledgeSummarySchema = z
  .object({
    total: z.number().int().min(0),
  })
  .strict();
export type GoalWorkspaceKnowledgeSummary = z.infer<typeof GoalWorkspaceKnowledgeSummarySchema>;

export const GoalWorkspaceKnowledgePageSchema = z
  .object({
    items: z.array(GoalWorkspaceKnowledgeItemSchema),
    total: z.number().int().min(0),
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().min(0),
  })
  .strict();
export type GoalWorkspaceKnowledgePage = z.infer<typeof GoalWorkspaceKnowledgePageSchema>;

const unavailableContext = z
  .object({
    availability: z.literal('Unavailable'),
    summary: z.null(),
    preview: z.array(z.never()).length(0),
  })
  .strict();

export const GoalWorkspaceTaskContextSchema = z.discriminatedUnion('availability', [
  z
    .object({
      availability: z.literal('Available'),
      summary: TaskGoalContextSummarySchema,
      preview: z.array(TaskGoalContextItemSchema),
    })
    .strict(),
  unavailableContext,
]);
export type GoalWorkspaceTaskContext = z.infer<typeof GoalWorkspaceTaskContextSchema>;

export const GoalWorkspaceKnowledgeContextSchema = z.discriminatedUnion('availability', [
  z
    .object({
      availability: z.literal('Available'),
      summary: GoalWorkspaceKnowledgeSummarySchema,
      preview: z.array(GoalWorkspaceKnowledgeItemSchema),
    })
    .strict(),
  unavailableContext,
]);
export type GoalWorkspaceKnowledgeContext = z.infer<typeof GoalWorkspaceKnowledgeContextSchema>;

/**
 * Read-only composition. Goal/KR authority stays in `goal`; external owners
 * supply context projections. `goal.reviews` is intentionally null here so
 * `recentReviews` is not a duplicated authority inside the same response.
 */
export const GoalWorkspaceReadModelSchema = z
  .object({
    goal: GoalClientDTOSchema,
    taskContext: GoalWorkspaceTaskContextSchema,
    knowledgeContext: GoalWorkspaceKnowledgeContextSchema,
    recentProgress: z.array(GoalRecordClientDTOSchema),
    recentReviews: z.array(GoalReviewClientDTOSchema),
  })
  .strict();
export type GoalWorkspaceReadModel = z.infer<typeof GoalWorkspaceReadModelSchema>;
