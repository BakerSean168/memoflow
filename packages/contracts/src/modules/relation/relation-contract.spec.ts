import { describe, expect, it } from 'vitest';
import { GoalKnowledgeLinkReqSchema, RelationDTOSchema, SubjectRefSchema } from './index';

const GOAL_ID = 'IGoalId_550e8400-e29b-41d4-a716-446655440000';
const DOCUMENT_ID = 'kdoc_550e8400-e29b-41d4-a716-446655440090';
const SPACE_ID = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440091';

describe('Shared Relation contracts', () => {
  it('accepts ADR-090 stable KnowledgeDocumentId for note refs and rejects path/projection ids', () => {
    expect(SubjectRefSchema.parse({ type: 'note', id: DOCUMENT_ID })).toEqual({
      type: 'note',
      id: DOCUMENT_ID,
    });
    expect(SubjectRefSchema.safeParse({ type: 'note', id: 'notes/interview.md' }).success).toBe(
      false,
    );
    expect(
      SubjectRefSchema.safeParse({ type: 'note', id: 'projection-notes-interview-md' }).success,
    ).toBe(false);
  });

  it('keeps generic relation serialized semantics strict and finite', () => {
    expect(
      RelationDTOSchema.safeParse({
        id: 'relation-1',
        subject: { type: 'goal', id: GOAL_ID },
        relationType: 'related',
        object: { type: 'note', id: DOCUMENT_ID },
        createdAt: 1,
      }).success,
    ).toBe(true);
    expect(
      RelationDTOSchema.safeParse({
        id: 'relation-1',
        subject: { type: 'goal', id: GOAL_ID },
        relationType: 'related',
        object: { type: 'note', id: DOCUMENT_ID },
        createdAt: Number.NaN,
      }).success,
    ).toBe(false);
  });

  it('uses the full KnowledgeDocumentRef at the typed GoalKnowledge boundary', () => {
    expect(
      GoalKnowledgeLinkReqSchema.parse({
        goalId: GOAL_ID,
        knowledgeDocument: { knowledgeSpaceId: SPACE_ID, documentId: DOCUMENT_ID },
      }),
    ).toEqual({
      goalId: GOAL_ID,
      knowledgeDocument: { knowledgeSpaceId: SPACE_ID, documentId: DOCUMENT_ID },
    });
  });
});
