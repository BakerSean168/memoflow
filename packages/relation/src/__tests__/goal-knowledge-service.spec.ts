import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeDocumentRef } from '@memoflow/contracts/repository';
import {
  GoalKnowledgeListReqSchema,
  RelationDTOSchema,
  SubjectRefSchema,
} from '@memoflow/contracts/relation';
import type { RelationRepository } from '../domain/relation-repository';
import { GoalKnowledgeService } from '../application/goal-knowledge-service';

const GOAL_ID = GoalKnowledgeListReqSchema.parse({
  goalId: 'IGoalId_550e8400-e29b-41d4-a716-446655440000',
}).goalId;
const GOAL_REF = SubjectRefSchema.parse({ type: 'goal', id: GOAL_ID });
const NOTE_REF = SubjectRefSchema.parse({
  type: 'note',
  id: 'kdoc_550e8400-e29b-41d4-a716-446655440090',
});
const DOCUMENT_ID = NOTE_REF.id;
const SPACE_ID = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440091';
const DOC: KnowledgeDocumentRef = {
  knowledgeSpaceId: SPACE_ID as never,
  documentId: DOCUMENT_ID as never,
};

function repository(): RelationRepository {
  return {
    add: vi.fn(async (input) => ({
      id: 'rel-1',
      subject: input.subject,
      relationType: input.relationType,
      object: input.object,
      createdAt: 1,
    })),
    deleteById: vi.fn(async () => true),
    deleteExact: vi.fn(async () => true),
    deleteAllForEntity: vi.fn(async () => 2),
    findBySubject: vi.fn(async () => [
      RelationDTOSchema.parse({
        id: 'rel-1',
        subject: GOAL_REF,
        relationType: 'related',
        object: NOTE_REF,
        createdAt: 1,
      }),
    ]),
    findByObject: vi.fn(async () => [
      RelationDTOSchema.parse({
        id: 'rel-1',
        subject: GOAL_REF,
        relationType: 'related',
        object: NOTE_REF,
        createdAt: 1,
      }),
    ]),
  };
}

describe('GoalKnowledgeService', () => {
  it('links only a resolver-confirmed stable KnowledgeDocumentRef and stores documentId, never path', async () => {
    const relations = repository();
    const service = new GoalKnowledgeService(relations, { resolve: vi.fn(async () => DOC) });
    await expect(
      service.link('identity-1', { goalId: GOAL_ID, knowledgeDocument: DOC }),
    ).resolves.toEqual({
      relationId: 'rel-1',
      goalId: GOAL_ID,
      knowledgeDocument: DOC,
      createdAt: 1,
    });
    expect(relations.add).toHaveBeenCalledWith({
      identityId: 'identity-1',
      subject: GOAL_REF,
      relationType: 'related',
      object: NOTE_REF,
    });
  });

  it('fails closed when the requested space/document pair does not resolve for this identity', async () => {
    const relations = repository();
    const service = new GoalKnowledgeService(relations, { resolve: vi.fn(async () => null) });
    await expect(
      service.link('identity-1', { goalId: GOAL_ID, knowledgeDocument: DOC }),
    ).rejects.toThrow('not found');
    expect(relations.add).not.toHaveBeenCalled();
  });

  it('supports forward and reverse typed reads plus Goal cleanup without deleting Knowledge', async () => {
    const relations = repository();
    const service = new GoalKnowledgeService(relations, { resolve: vi.fn(async () => DOC) });
    await expect(service.listForGoal('identity-1', { goalId: GOAL_ID })).resolves.toHaveLength(1);
    await expect(
      service.listGoalsForKnowledge('identity-1', { knowledgeDocument: DOC }),
    ).resolves.toHaveLength(1);
    await expect(service.unlinkAllForGoal('identity-1', GOAL_ID as never)).resolves.toBe(2);
    expect(relations.deleteAllForEntity).toHaveBeenCalledWith('identity-1', GOAL_REF);
  });
});
