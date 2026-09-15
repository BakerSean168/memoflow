import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { SubjectRefSchema } from '@memoflow/contracts/relation';
import { describe, expect, it, vi } from 'vitest';
import { PowerSyncRelationRepository } from '../infrastructure/powersync/powersync-relation.repository';

const GOAL_REF = SubjectRefSchema.parse({
  type: 'goal',
  id: 'IGoalId_550e8400-e29b-41d4-a716-446655440000',
});
const NOTE_REF = SubjectRefSchema.parse({
  type: 'note',
  id: 'kdoc_550e8400-e29b-41d4-a716-446655440090',
});
const GOAL_ID = GOAL_REF.id;
const DOCUMENT_ID = NOTE_REF.id;
const input = {
  identityId: 'identity-1',
  subject: GOAL_REF,
  relationType: 'related' as const,
  object: NOTE_REF,
};

function row() {
  return {
    id: 'rel-existing',
    identity_id: 'identity-1',
    subject_type: 'goal',
    subject_id: GOAL_ID,
    relation_type: 'related',
    object_type: 'note',
    object_id: DOCUMENT_ID,
    created_at: '2026-09-12T00:00:00.000Z',
    updated_at: '2026-09-12T00:00:00.000Z',
  };
}

function createDb(existing: boolean) {
  const execute = vi.fn(async () => ({ rowsAffected: 1 }));
  const getOptional = vi.fn(async () => (existing ? row() : null));
  const getAll = vi.fn(async () => [] as unknown[]);
  const tx = {
    execute,
    getOptional,
    getAll,
    get: vi.fn(),
  } as unknown as IElectronDatabaseTransaction;
  const db = {
    execute,
    getOptional,
    getAll,
    get: vi.fn(),
    writeTransaction: vi.fn(async (work) => work(tx)),
  } as unknown as IElectronDatabase;
  return { db, execute, getOptional, getAll };
}

describe('PowerSyncRelationRepository', () => {
  it('replays an existing exact relation without a second insert', async () => {
    const { db, execute } = createDb(true);
    const repository = new PowerSyncRelationRepository(
      db,
      () => 'rel-new',
      () => 1,
    );
    await expect(repository.add(input)).resolves.toMatchObject({ id: 'rel-existing' });
    expect(execute).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO relations'),
      expect.anything(),
    );
  });

  it('inserts the same durable columns as Prisma and preserves stable note identity', async () => {
    const { db, execute } = createDb(false);
    const repository = new PowerSyncRelationRepository(
      db,
      () => 'rel-new',
      () => 1000,
    );
    await expect(repository.add(input)).resolves.toMatchObject({
      id: 'rel-new',
      object: NOTE_REF,
      createdAt: 1000,
    });
    expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO relations'), [
      'rel-new',
      'identity-1',
      'goal',
      GOAL_ID,
      'related',
      'note',
      DOCUMENT_ID,
      '1970-01-01T00:00:01.000Z',
      '1970-01-01T00:00:01.000Z',
    ]);
  });

  it('uses identity-scoped forward/reverse and entity cleanup queries', async () => {
    const { db } = createDb(false);
    const repository = new PowerSyncRelationRepository(db);
    await repository.findBySubject('identity-1', GOAL_REF);
    await repository.findByObject('identity-1', NOTE_REF);
    await repository.deleteAllForEntity('identity-1', GOAL_REF);
    expect(db.getAll).toHaveBeenCalledTimes(2);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('subject_type = ?'), [
      'identity-1',
      'goal',
      GOAL_ID,
      'goal',
      GOAL_ID,
    ]);
  });
  it('pushes filtered pagination and total count into PowerSync SQL', async () => {
    const { db, getAll } = createDb(false);
    getAll.mockResolvedValueOnce([row()]).mockResolvedValueOnce([{ count: 7 }]);
    const repository = new PowerSyncRelationRepository(db);

    await expect(
      repository.findPageBySubject({
        identityId: 'identity-1',
        subject: GOAL_REF,
        relationType: 'related',
        objectType: 'note',
        limit: 2,
        offset: 4,
      }),
    ).resolves.toMatchObject({ total: 7, limit: 2, offset: 4 });

    expect(getAll).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/relation_type = \?.*object_type = \?[\s\S]*LIMIT \? OFFSET \?/),
      ['identity-1', 'goal', GOAL_ID, 'related', 'note', 2, 4],
    );
    expect(getAll).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(
        /SELECT COUNT\(\*\) as count[\s\S]*relation_type = \?.*object_type = \?/,
      ),
      ['identity-1', 'goal', GOAL_ID, 'related', 'note'],
    );
  });
});
