import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PowerSyncDatabase } from '@powersync/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SubjectRefSchema } from '@memoflow/relation-contracts';
import type { AddRelationInput } from '../../domain/relation-repository';
import { PowerSyncGoalRelationCleanupCapability } from './powersync-goal-relation-cleanup';
import { PowerSyncRelationRepository } from './powersync-relation.repository';

let db: PowerSyncDatabase;
let dbPath: string;
let repository: PowerSyncRelationRepository;
const entity = SubjectRefSchema.parse({
  type: 'goal',
  id: 'IGoalId_550e8400-e29b-41d4-a716-446655440000',
});
const note = SubjectRefSchema.parse({
  type: 'note',
  id: 'kdoc_550e8400-e29b-41d4-a716-446655440090',
});
const input: AddRelationInput = {
  identityId: 'identity',
  subject: entity,
  relationType: 'related',
  object: note,
};

beforeEach(async () => {
  const { PowerSyncAppSchema } = await import('@memoflow/powersync-schema');
  dbPath = path.join(os.tmpdir(), `memoflow-relation-${randomUUID()}.db`);
  db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: dbPath },
  });
  await db.waitForReady();
  expect(await db.get('SELECT type FROM sqlite_master WHERE name = ?', ['relations'])).toEqual({
    type: 'view',
  });
  repository = new PowerSyncRelationRepository(db);
});
afterEach(async () => {
  await db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

async function seed(id = 'relation', value = input) {
  await db.execute(
    `INSERT INTO relations (id, identity_id, subject_type, subject_id, relation_type, object_type, object_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      value.identityId,
      value.subject.type,
      value.subject.id,
      value.relationType,
      value.object.type,
      value.object.id,
      '2026-10-29T00:00:00.000Z',
      '2026-10-29T00:00:00.000Z',
    ],
  );
}
const rows = () => db.getAll('SELECT * FROM relations ORDER BY id');

describe('relation deletes on real PowerSync views (#709)', () => {
  it('deleteById returns true for a stored row and removes it', async () => {
    await seed();
    const result = await repository.deleteById('identity', 'relation');
    expect(await rows()).toEqual([]);
    expect(result).toBe(true);
  });
  it('deleteById returns false for an absent id and preserves stored rows', async () => {
    await seed();
    const before = await rows();
    const result = await repository.deleteById('identity', 'missing');
    expect(await rows()).toEqual(before);
    expect(result).toBe(false);
  });
  it('deleteById returns false for another identity and preserves the row', async () => {
    await seed();
    const before = await rows();
    const result = await repository.deleteById('foreign', 'relation');
    expect(await rows()).toEqual(before);
    expect(result).toBe(false);
  });
  it('deleteExact returns true for the matching tuple and removes it', async () => {
    await seed();
    const result = await repository.deleteExact(input);
    expect(await rows()).toEqual([]);
    expect(result).toBe(true);
  });
  it('deleteExact returns false for a mismatched tuple and preserves the row', async () => {
    await seed();
    const before = await rows();
    const result = await repository.deleteExact({ ...input, object: entity });
    expect(await rows()).toEqual(before);
    expect(result).toBe(false);
  });
  it('deleteAllForEntity counts both directions exactly and preserves foreign and unrelated rows', async () => {
    await seed('subject');
    await seed('object', { ...input, subject: note, object: entity });
    await seed('both', { ...input, object: entity });
    await seed('foreign', { ...input, identityId: 'foreign' });
    await seed('unrelated', { ...input, subject: note });
    const preserved = await db.getAll(
      "SELECT * FROM relations WHERE id IN ('foreign', 'unrelated') ORDER BY id",
    );
    const result = await repository.deleteAllForEntity('identity', entity);
    expect(await rows()).toEqual(preserved);
    expect(result).toBe(3);
  });
  it('deleteAllForEntity returns zero when no relation matches and preserves stored rows', async () => {
    await seed('unrelated', { ...input, subject: note });
    const before = await rows();
    const result = await repository.deleteAllForEntity('identity', entity);
    expect(await rows()).toEqual(before);
    expect(result).toBe(0);
  });
});

describe('#24 transaction-scoped Goal cleanup on real PowerSync', () => {
  it('counts both directions once and isolates identity and entity type', async () => {
    await seed('subject');
    await seed('object', { ...input, subject: note, object: entity });
    await seed('both', { ...input, object: entity });
    await seed('foreign', { ...input, identityId: 'foreign' });
    await seed('unrelated', { ...input, subject: note });
    await db.execute(
      "INSERT INTO relations (id, identity_id, subject_type, subject_id, object_type, object_id) VALUES ('wrong-type', 'identity', 'note', ?, 'note', ?)",
      [entity.id, entity.id],
    );
    const preserved = await db.getAll(
      "SELECT * FROM relations WHERE id IN ('foreign', 'unrelated', 'wrong-type') ORDER BY id",
    );
    const result = await db.writeTransaction((tx) =>
      new PowerSyncGoalRelationCleanupCapability(tx).unlinkAllForGoal('identity', entity.id),
    );
    expect(await rows()).toEqual(preserved);
    expect(result).toBe(3);
  });
  it('returns zero for no matches inside the caller transaction', async () => {
    await seed('foreign', { ...input, identityId: 'foreign' });
    const before = await rows();
    expect(
      await db.writeTransaction((tx) =>
        new PowerSyncGoalRelationCleanupCapability(tx).unlinkAllForGoal('identity', entity.id),
      ),
    ).toBe(0);
    expect(await rows()).toEqual(before);
  });
  it('shares the caller rollback boundary', async () => {
    await seed();
    const before = await rows();
    await expect(
      db.writeTransaction(async (tx) => {
        await new PowerSyncGoalRelationCleanupCapability(tx).unlinkAllForGoal(
          'identity',
          entity.id,
        );
        throw new Error('caller rollback');
      }),
    ).rejects.toThrow('caller rollback');
    expect(await rows()).toEqual(before);
  });
});
