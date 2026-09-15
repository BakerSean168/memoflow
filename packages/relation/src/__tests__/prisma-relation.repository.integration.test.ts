import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SubjectRefSchema } from '@memoflow/contracts/relation';
import { PrismaRelationRepository } from '../infrastructure/prisma/prisma-relation.repository';

const GOAL_REF = SubjectRefSchema.parse({
  type: 'goal',
  id: 'IGoalId_550e8400-e29b-41d4-a716-446655440000',
});
const NOTE_REF = SubjectRefSchema.parse({
  type: 'note',
  id: 'kdoc_550e8400-e29b-41d4-a716-446655440090',
});
const TASK_REF = SubjectRefSchema.parse({
  type: 'task',
  id: 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001',
});

describe('PrismaRelationRepository integration', () => {
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });
  beforeEach(async () => {
    await cleanAll();
  });

  it('is idempotent, identity-scoped, and reverse-queryable for Goal --related--> stable Note', async () => {
    await seedAccount({ id: 'relation-int-1' });
    await seedAccount({ id: 'relation-int-2' });
    const db = await getPrisma();
    let next = 0;
    const repository = new PrismaRelationRepository(db, () => `relation-${++next}`);
    const relation = { subject: GOAL_REF, relationType: 'related' as const, object: NOTE_REF };

    const first = await repository.add({ identityId: 'relation-int-1', ...relation });
    const replay = await repository.add({ identityId: 'relation-int-1', ...relation });
    await repository.add({ identityId: 'relation-int-2', ...relation });

    expect(replay.id).toBe(first.id);
    await expect(
      repository.findBySubject('relation-int-1', relation.subject),
    ).resolves.toHaveLength(1);
    await expect(repository.findByObject('relation-int-1', relation.object)).resolves.toHaveLength(
      1,
    );
    expect(await db.relation.count()).toBe(2);
  });

  it('deletes every relation involving a deleted Goal but leaves unrelated rows intact', async () => {
    await seedAccount({ id: 'relation-cleanup' });
    const db = await getPrisma();
    let next = 0;
    const repository = new PrismaRelationRepository(db, () => `cleanup-${++next}`);
    await repository.add({
      identityId: 'relation-cleanup',
      subject: GOAL_REF,
      relationType: 'related',
      object: NOTE_REF,
    });
    await repository.add({
      identityId: 'relation-cleanup',
      subject: TASK_REF,
      relationType: 'depends_on',
      object: GOAL_REF,
    });
    await repository.add({
      identityId: 'relation-cleanup',
      subject: { type: 'habit', id: '550e8400-e29b-41d4-a716-446655440002' },
      relationType: 'related',
      object: { type: 'wallet', id: '550e8400-e29b-41d4-a716-446655440003' },
    });

    await expect(repository.deleteAllForEntity('relation-cleanup', GOAL_REF)).resolves.toBe(2);
    expect(await db.relation.count({ where: { identityId: 'relation-cleanup' } })).toBe(1);
  });

  it('pages Goal Knowledge edges in the owner query without scanning unrelated relations', async () => {
    await seedAccount({ id: 'relation-page' });
    const db = await getPrisma();
    let next = 0;
    const repository = new PrismaRelationRepository(db, () => `page-${++next}`);
    const note2 = SubjectRefSchema.parse({
      type: 'note',
      id: 'kdoc_550e8400-e29b-41d4-a716-446655440091',
    });
    await repository.add({
      identityId: 'relation-page',
      subject: GOAL_REF,
      relationType: 'related',
      object: NOTE_REF,
    });
    await repository.add({
      identityId: 'relation-page',
      subject: GOAL_REF,
      relationType: 'related',
      object: note2,
    });
    await repository.add({
      identityId: 'relation-page',
      subject: GOAL_REF,
      relationType: 'depends_on',
      object: TASK_REF,
    });

    const page = await repository.findPageBySubject({
      identityId: 'relation-page',
      subject: GOAL_REF,
      relationType: 'related',
      objectType: 'note',
      limit: 1,
      offset: 1,
    });

    expect(page).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.relationType).toBe('related');
    expect(page.items[0]?.object.type).toBe('note');
  });
});
