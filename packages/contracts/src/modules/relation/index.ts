import { z } from 'zod';
import type { GoalId, KnowledgeDocumentId, ReminderTemplateId, TaskPlanId } from '../../primitives';
import { brandedId } from '../../primitives/zod-extensions';
import {
  KnowledgeDocumentIdSchema,
  KnowledgeDocumentRefSchema,
  type KnowledgeDocumentRef,
} from '../repository';

export const SubjectTypes = ['note', 'goal', 'task', 'reminder', 'habit', 'wallet'] as const;
export type SubjectType = (typeof SubjectTypes)[number];

export const RelationTypes = ['references', 'related', 'depends_on', 'contributes_to'] as const;
export const RelationTypeSchema = z.enum(RelationTypes);
export type RelationType = z.infer<typeof RelationTypeSchema>;

const GenericUuidOrPrefixedIdSchema = z.string().min(1);

export const SubjectRefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('note'), id: KnowledgeDocumentIdSchema }).strict(),
  z.object({ type: z.literal('goal'), id: brandedId<GoalId>() }).strict(),
  z.object({ type: z.literal('task'), id: brandedId<TaskPlanId>() }).strict(),
  z.object({ type: z.literal('reminder'), id: brandedId<ReminderTemplateId>() }).strict(),
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
