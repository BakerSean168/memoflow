import { z } from 'zod';
import type { KnowledgeDocumentId } from '@memoflow/repository-contracts';
import type { TaskPlanId } from '@memoflow/task-contracts';
import type { GoalId } from '@memoflow/goal-contracts';
import { brandedId } from '@memoflow/shared-primitives/zod-extensions';
import type { Result } from '@memoflow/transport-contracts/result';
import {
  KnowledgeDocumentIdSchema,
  KnowledgeDocumentRefSchema,
  type KnowledgeDocumentRef,
} from '@memoflow/repository-contracts';

export const SubjectTypes = ['note', 'goal', 'task', 'habit', 'wallet'] as const;
export type SubjectType = (typeof SubjectTypes)[number];

export const RelationTypes = ['references', 'related', 'depends_on', 'contributes_to'] as const;
export const RelationTypeSchema = z.enum(RelationTypes);
export type RelationType = z.infer<typeof RelationTypeSchema>;

const GenericUuidOrPrefixedIdSchema = z.string().min(1);

export const SubjectRefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('note'), id: KnowledgeDocumentIdSchema }).strict(),
  z.object({ type: z.literal('goal'), id: brandedId<GoalId>() }).strict(),
  z.object({ type: z.literal('task'), id: brandedId<TaskPlanId>() }).strict(),
  z.object({ type: z.literal('habit'), id: GenericUuidOrPrefixedIdSchema }).strict(),
  z.object({ type: z.literal('wallet'), id: GenericUuidOrPrefixedIdSchema }).strict(),
]);
export type SubjectRef = z.infer<typeof SubjectRefSchema>;

export type NoteSubjectRef = Extract<SubjectRef, { type: 'note' }> & {
  readonly id: KnowledgeDocumentId;
};

export const RelationDTOSchema = z
  .object({
    id: z.string().min(1),
    subject: SubjectRefSchema,
    relationType: RelationTypeSchema,
    object: SubjectRefSchema,
    createdAt: z.number().finite(),
  })
  .strict();
export type RelationDTO = z.infer<typeof RelationDTOSchema>;

export const CreateRelationReqSchema = z
  .object({
    subject: SubjectRefSchema,
    relationType: RelationTypeSchema,
    object: SubjectRefSchema,
  })
  .strict();
export type CreateRelationReq = z.infer<typeof CreateRelationReqSchema>;

export const DeleteRelationReqSchema = z.object({ relationId: z.string().min(1) }).strict();
export type DeleteRelationReq = z.infer<typeof DeleteRelationReqSchema>;

export const GoalKnowledgeLinkReqSchema = z
  .object({
    goalId: brandedId<GoalId>(),
    knowledgeDocument: KnowledgeDocumentRefSchema,
  })
  .strict();
export type GoalKnowledgeLinkReq = z.infer<typeof GoalKnowledgeLinkReqSchema>;

export const GoalKnowledgeListReqSchema = z.object({ goalId: brandedId<GoalId>() }).strict();
export type GoalKnowledgeListReq = z.infer<typeof GoalKnowledgeListReqSchema>;

export const GoalsForKnowledgeReqSchema = z
  .object({ knowledgeDocument: KnowledgeDocumentRefSchema })
  .strict();
export type GoalsForKnowledgeReq = z.infer<typeof GoalsForKnowledgeReqSchema>;

export const GoalKnowledgeRelationSchema = z
  .object({
    relationId: z.string().min(1),
    goalId: brandedId<GoalId>(),
    knowledgeDocument: KnowledgeDocumentRefSchema,
    createdAt: z.number().finite(),
  })
  .strict();
export type GoalKnowledgeRelation = z.infer<typeof GoalKnowledgeRelationSchema>;

export type GoalKnowledgeDocumentRef = KnowledgeDocumentRef;

/**
 * Goal↔Knowledge relation port shared by every surface.
 * 跨表面共享的 Goal↔Knowledge 关系端口。
 *
 * The contract owns the port shape only; HTTP, IPC and in-process adapters live
 * with their transports. Consumers that need a subset narrow it with `Pick<>`
 * instead of redeclaring the members.
 * 契约只负责端口形状，HTTP/IPC/进程内适配器归属各自传输层；只需子集的消费方用
 * `Pick<>` 收窄，不重复声明成员。
 */
export interface GoalKnowledgeClientPort {
  linkGoalKnowledge(request: GoalKnowledgeLinkReq): Promise<Result<GoalKnowledgeRelation>>;
  unlinkGoalKnowledge(request: GoalKnowledgeLinkReq): Promise<Result<{ unlinked: boolean }>>;
  listGoalKnowledge(request: GoalKnowledgeListReq): Promise<Result<GoalKnowledgeRelation[]>>;
  listGoalsForKnowledge(request: GoalsForKnowledgeReq): Promise<Result<GoalKnowledgeRelation[]>>;
}

export const GoalKnowledgeEdgePageRequestSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
export type GoalKnowledgeEdgePageRequest = z.input<typeof GoalKnowledgeEdgePageRequestSchema>;

export const GoalKnowledgeEdgeListReqSchema = GoalKnowledgeEdgePageRequestSchema.extend({
  goalId: brandedId<GoalId>(),
});
export type GoalKnowledgeEdgeListReq = z.input<typeof GoalKnowledgeEdgeListReqSchema>;

export const GoalKnowledgeEdgeRefSchema = z
  .object({
    relationId: z.string().min(1),
    goalId: brandedId<GoalId>(),
    documentId: KnowledgeDocumentIdSchema,
    createdAt: z.number().finite(),
  })
  .strict();
export type GoalKnowledgeEdgeRef = z.infer<typeof GoalKnowledgeEdgeRefSchema>;

export const GoalKnowledgeEdgePageSchema = z
  .object({
    items: z.array(GoalKnowledgeEdgeRefSchema),
    total: z.number().int().min(0),
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().min(0),
  })
  .strict();
export type GoalKnowledgeEdgePage = z.infer<typeof GoalKnowledgeEdgePageSchema>;

export const TaskKnowledgeEdgeListReqSchema = GoalKnowledgeEdgePageRequestSchema.extend({
  taskPlanId: brandedId<TaskPlanId>(),
});
export type TaskKnowledgeEdgeListReq = z.input<typeof TaskKnowledgeEdgeListReqSchema>;

export const TaskKnowledgeEdgeRefSchema = z
  .object({
    relationId: z.string().min(1),
    taskPlanId: brandedId<TaskPlanId>(),
    documentId: KnowledgeDocumentIdSchema,
    createdAt: z.number().finite(),
  })
  .strict();
export type TaskKnowledgeEdgeRef = z.infer<typeof TaskKnowledgeEdgeRefSchema>;

export const TaskKnowledgeEdgePageSchema = z
  .object({
    items: z.array(TaskKnowledgeEdgeRefSchema),
    total: z.number().int().min(0),
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().min(0),
  })
  .strict();
export type TaskKnowledgeEdgePage = z.infer<typeof TaskKnowledgeEdgePageSchema>;
