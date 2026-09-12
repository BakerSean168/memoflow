import { describe, expect, it, vi } from 'vitest';
import { executeRelationCrudOperation } from './relation-crud-executor.js';

const GOAL_ID = 'IGoalId_550e8400-e29b-41d4-a716-446655440000';
const DOCUMENT_ID = 'kdoc_550e8400-e29b-41d4-a716-446655440090';
const DATA = {
  subject_type: 'goal',
  subject_id: GOAL_ID,
  relation_type: 'related',
  object_type: 'note',
  object_id: DOCUMENT_ID,
};

function db(existing: Record<string, unknown>[] = []) {
  const rows = [...existing];
  const relation = {
    findFirst: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        (rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ??
          null) as never,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      rows.push(data);
      return data;
    }),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => ({
      count: rows.filter((row) => Object.entries(where).every(([key, value]) => row[key] === value))
        .length,
    })),
  };
  return { relation, rows };
}

describe('Relation PowerSync CRUD executor', () => {
  it('creates a stable Goal--related-->Knowledge edge owned by authenticated identity', async () => {
    const store = db();
    await executeRelationCrudOperation(store, 'identity-1', {
      op: 'PUT',
      type: 'relations',
      id: 'relation-1',
      data: DATA,
    });
    expect(store.relation.create).toHaveBeenCalledWith({
      data: {
        id: 'relation-1',
        identityId: 'identity-1',
        subjectType: 'goal',
        subjectId: GOAL_ID,
        relationType: 'related',
        objectType: 'note',
        objectId: DOCUMENT_ID,
      },
    });
  });

  it('rejects path-derived note ids and mutable PATCH operations', async () => {
    const store = db();
    await expect(
      executeRelationCrudOperation(store, 'identity-1', {
        op: 'PUT',
        type: 'relations',
        id: 'relation-1',
        data: { ...DATA, object_id: 'notes/interview.md' },
      }),
    ).rejects.toThrow();
    await expect(
      executeRelationCrudOperation(store, 'identity-1', {
        op: 'PATCH',
        type: 'relations',
        id: 'relation-1',
        data: {},
      }),
    ).rejects.toThrow('PATCH is not supported');
    expect(store.relation.create).not.toHaveBeenCalled();
  });

  it('scopes DELETE to authenticated identity', async () => {
    const store = db();
    await executeRelationCrudOperation(store, 'identity-1', {
      op: 'DELETE',
      type: 'relations',
      id: 'relation-1',
    });
    expect(store.relation.deleteMany).toHaveBeenCalledWith({
      where: { id: 'relation-1', identityId: 'identity-1' },
    });
  });

  it('is replay-safe for the same id and the same logical edge', async () => {
    const existing = {
      id: 'relation-1',
      identityId: 'identity-1',
      subjectType: 'goal',
      subjectId: GOAL_ID,
      relationType: 'related',
      objectType: 'note',
      objectId: DOCUMENT_ID,
    };
    const store = db([existing]);
    await executeRelationCrudOperation(store, 'identity-1', {
      op: 'PUT',
      type: 'relations',
      id: 'relation-1',
      data: DATA,
    });
    expect(store.relation.create).not.toHaveBeenCalled();
  });
});
