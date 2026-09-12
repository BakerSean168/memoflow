import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { GoalPolicy } from '../../../domain';
import { DeleteGoalUseCase } from '../../../application/use-cases/commands/delete-goal.use-case';
import { GoalPrismaRepository } from './goal-prisma.repository';
import { PrismaGoalDeletionTransactionRunner } from './prisma-goal-deletion-transaction-runner';

const IDENTITY_ID = 'relation-delete-identity';
const GOAL_ID = 'IGoalId_550e8400-e29b-41d4-a716-446655440720';
const DOCUMENT_ID = 'kdoc_550e8400-e29b-41d4-a716-446655440721';

async function seedGoalWithRelation() {
  const db = await getPrisma();
  await seedAccount({ id: IDENTITY_ID });
  await db.goal.create({
    data: {
      id: GOAL_ID,
      identityId: IDENTITY_ID,
      name: 'Atomic relation cleanup',
      status: 'InProgress',
      version: 1,
    },
  });
  await db.relation.create({
    data: {
      id: 'relation-delete-1',
      identityId: IDENTITY_ID,
      subjectType: 'goal',
      subjectId: GOAL_ID,
      relationType: 'related',
      objectType: 'note',
      objectId: DOCUMENT_ID,
    },
  });
  return db;
}

const noTaskBindings = {
  checkActiveTaskBindings: async () => ({ hasActiveBindings: false, activeCount: 0 }),
};

describe('Prisma Goal deletion + Shared Relation cleanup transaction', () => {
  beforeEach(async () => {
    await cleanAll();
  });

  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  it('commits soft-delete and Relation unlink atomically', async () => {
    const db = await seedGoalWithRelation();
    const useCase = new DeleteGoalUseCase(
      new GoalPrismaRepository(db),
      new GoalPolicy(),
      noTaskBindings,
      new PrismaGoalDeletionTransactionRunner(db, (tx) => ({
        unlinkAllForGoal: async (identityId, goalId) =>
          (
            await tx.relation.deleteMany({
              where: {
                identityId,
                OR: [
                  { subjectType: 'goal', subjectId: goalId },
                  { objectType: 'goal', objectId: goalId },
                ],
              },
            })
          ).count,
      })),
    );

    await expect(useCase.execute(GOAL_ID, IDENTITY_ID, 1)).resolves.toMatchObject({ ok: true });
    const [goal, relationCount] = await Promise.all([
      db.goal.findUnique({ where: { id: GOAL_ID } }),
      db.relation.count({ where: { identityId: IDENTITY_ID, subjectId: GOAL_ID } }),
    ]);
    expect(goal?.deletedAt).not.toBeNull();
    expect(goal?.version).toBe(2);
    expect(relationCount).toBe(0);
  });

  it('rolls Goal mutation back when Shared Relation cleanup fails', async () => {
    const db = await seedGoalWithRelation();
    const useCase = new DeleteGoalUseCase(
      new GoalPrismaRepository(db),
      new GoalPolicy(),
      noTaskBindings,
      new PrismaGoalDeletionTransactionRunner(db, () => ({
        unlinkAllForGoal: async () => {
          throw new Error('relation cleanup unavailable');
        },
      })),
    );

    await expect(useCase.execute(GOAL_ID, IDENTITY_ID, 1)).rejects.toThrow(
      'relation cleanup unavailable',
    );
    const [goal, relationCount] = await Promise.all([
      db.goal.findUnique({ where: { id: GOAL_ID } }),
      db.relation.count({ where: { identityId: IDENTITY_ID, subjectId: GOAL_ID } }),
    ]);
    expect(goal?.deletedAt).toBeNull();
    expect(goal?.version).toBe(1);
    expect(relationCount).toBe(1);
  });
});
