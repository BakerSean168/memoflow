import {
  GoalKnowledgeEdgeListReqSchema,
  GoalKnowledgeEdgePageSchema,
  GoalKnowledgeLinkReqSchema,
  GoalKnowledgeListReqSchema,
  GoalsForKnowledgeReqSchema,
  type GoalKnowledgeEdgeListReq,
  type GoalKnowledgeEdgePage,
  type GoalKnowledgeLinkReq,
  type GoalKnowledgeRelation,
  type GoalKnowledgeListReq,
  type GoalsForKnowledgeReq,
  type RelationDTO,
} from '@memoflow/contracts/relation';
import type { KnowledgeDocumentRef } from '@memoflow/contracts/repository';
import type { GoalId } from '@memoflow/contracts/primitives';
import type { RelationRepository } from '../domain/relation-repository';

export interface KnowledgeDocumentRefResolver {
  /** Resolve only stable managed Knowledge documents; path-derived projections must never satisfy this port. */
  resolve(
    identityId: string,
    documentId: KnowledgeDocumentRef['documentId'],
  ): Promise<KnowledgeDocumentRef | null>;
}

export class GoalKnowledgeService {
  constructor(
    private readonly relations: RelationRepository,
    private readonly knowledge: KnowledgeDocumentRefResolver,
  ) {}

  async link(identityId: string, request: GoalKnowledgeLinkReq): Promise<GoalKnowledgeRelation> {
    const parsed = GoalKnowledgeLinkReqSchema.parse(request);
    const resolved = await this.knowledge.resolve(identityId, parsed.knowledgeDocument.documentId);
    if (!resolved || resolved.knowledgeSpaceId !== parsed.knowledgeDocument.knowledgeSpaceId) {
      throw new Error('Knowledge document not found for current identity.');
    }
    const relation = await this.relations.add({
      identityId,
      subject: { type: 'goal', id: parsed.goalId },
      relationType: 'related',
      object: { type: 'note', id: parsed.knowledgeDocument.documentId },
    });
    return toGoalKnowledgeRelation(relation, resolved);
  }

  async unlink(identityId: string, request: GoalKnowledgeLinkReq): Promise<boolean> {
    const parsed = GoalKnowledgeLinkReqSchema.parse(request);
    return this.relations.deleteExact({
      identityId,
      subject: { type: 'goal', id: parsed.goalId },
      relationType: 'related',
      object: { type: 'note', id: parsed.knowledgeDocument.documentId },
    });
  }

  async listEdgeRefsForGoal(
    identityId: string,
    request: GoalKnowledgeEdgeListReq,
  ): Promise<GoalKnowledgeEdgePage> {
    const parsed = GoalKnowledgeEdgeListReqSchema.parse(request);
    const page = await this.relations.findPageBySubject({
      identityId,
      subject: { type: 'goal', id: parsed.goalId },
      relationType: 'related',
      objectType: 'note',
      limit: parsed.limit,
      offset: parsed.offset,
    });
    return GoalKnowledgeEdgePageSchema.parse({
      items: page.items.map((row) => ({
        relationId: row.id,
        goalId: parsed.goalId,
        documentId: row.object.id,
        createdAt: row.createdAt,
      })),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    });
  }

  async listForGoal(
    identityId: string,
    request: GoalKnowledgeListReq,
  ): Promise<GoalKnowledgeRelation[]> {
    const { goalId } = GoalKnowledgeListReqSchema.parse(request);
    const rows = await this.relations.findBySubject(identityId, { type: 'goal', id: goalId });
    return this.resolveRows(identityId, rows, goalId);
  }

  async listGoalsForKnowledge(
    identityId: string,
    request: GoalsForKnowledgeReq,
  ): Promise<GoalKnowledgeRelation[]> {
    const parsed = GoalsForKnowledgeReqSchema.parse(request);
    const resolved = await this.knowledge.resolve(identityId, parsed.knowledgeDocument.documentId);
    if (!resolved || resolved.knowledgeSpaceId !== parsed.knowledgeDocument.knowledgeSpaceId)
      return [];
    const rows = await this.relations.findByObject(identityId, {
      type: 'note',
      id: parsed.knowledgeDocument.documentId,
    });
    return rows
      .filter(
        (row): row is RelationDTO & { subject: { type: 'goal'; id: GoalId } } =>
          row.relationType === 'related' && row.subject.type === 'goal',
      )
      .map((row) => toGoalKnowledgeRelation(row, resolved));
  }

  async unlinkAllForGoal(identityId: string, goalId: GoalId): Promise<number> {
    return this.relations.deleteAllForEntity(identityId, { type: 'goal', id: goalId });
  }

  private async resolveRows(
    identityId: string,
    rows: RelationDTO[],
    goalId: GoalId,
  ): Promise<GoalKnowledgeRelation[]> {
    const result: GoalKnowledgeRelation[] = [];
    for (const row of rows) {
      if (row.relationType !== 'related' || row.object.type !== 'note') continue;
      const resolved = await this.knowledge.resolve(identityId, row.object.id);
      if (!resolved) continue;
      result.push({
        relationId: row.id,
        goalId,
        knowledgeDocument: resolved,
        createdAt: row.createdAt,
      });
    }
    return result;
  }
}

function toGoalKnowledgeRelation(
  relation: RelationDTO,
  knowledgeDocument: KnowledgeDocumentRef,
): GoalKnowledgeRelation {
  if (relation.subject.type !== 'goal' || relation.object.type !== 'note') {
    throw new TypeError('GoalKnowledge relation must be Goal --related--> Note.');
  }
  return {
    relationId: relation.id,
    goalId: relation.subject.id,
    knowledgeDocument,
    createdAt: relation.createdAt,
  };
}
