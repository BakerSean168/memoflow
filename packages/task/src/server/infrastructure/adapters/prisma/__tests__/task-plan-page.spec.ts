import { expect, it, vi } from 'vitest';
import type { TaskPlanPageQuery } from '../../../../domain/repositories/i-task-plan-repository';
import type { PrismaClient } from '@memoflow/database';
import { TaskPlanPrismaRepository } from '../task-plan-prisma.repository';

it('pushes all label AND predicates and scope into both bounded Prisma queries', async () => {
  const taskPlan = {
    count: vi.fn().mockResolvedValue(27),
    findMany: vi.fn().mockResolvedValue([]),
  };
  const repo = new TaskPlanPrismaRepository({ taskPlan } as unknown as PrismaClient, {
    publish: vi.fn(),
  });
  expect(
    await repo.findPage('owner', {
      goalId: 'goal',
      keyResultId: 'kr',
      status: ['Active', 'Paused'],
      outcome: ['Open'],
      archiveState: 'active',
      labelIdsAll: ['a', 'b', 'a'],
      limit: 10,
      offset: 30,
    }),
  ).toEqual({ plans: [], total: 27 });
  const where = {
    identityId: 'owner',
    deletedAt: null,
    goalId: 'goal',
    keyResultId: 'kr',
    status: { in: ['Active', 'Paused'] },
    outcome: { in: ['Open'] },
    archivedAt: null,
    AND: ['a', 'b'].map((labelId) => ({ labelLinks: { some: { identityId: 'owner', labelId } } })),
  };
  expect(taskPlan.count).toHaveBeenCalledWith({ where });
  expect(taskPlan.findMany).toHaveBeenCalledWith({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    skip: 30,
    take: 10,
  });
});


it.each<{ filter: Partial<TaskPlanPageQuery>; where: object }>([
  { filter: {}, where: {} },
  { filter: { outcome: [], archiveState: 'all' }, where: {} },
  { filter: { outcome: ['Succeeded'] }, where: { outcome: { in: ['Succeeded'] } } },
  { filter: { outcome: ['Failed', 'Abandoned'] }, where: { outcome: { in: ['Failed', 'Abandoned'] } } },
  { filter: { archiveState: 'archived' }, where: { archivedAt: { not: null } } },
  { filter: { status: ['Paused'], outcome: ['Open'], archiveState: 'active' },
    where: { status: { in: ['Paused'] }, outcome: { in: ['Open'] }, archivedAt: null } },
])('uses the same state predicates for Prisma count and page: $filter', async ({ filter, where }) => {
  const taskPlan = {
    count: vi.fn().mockResolvedValue(7),
    findMany: vi.fn().mockResolvedValue([]),
  };
  const repo = new TaskPlanPrismaRepository({ taskPlan } as unknown as PrismaClient, {
    publish: vi.fn(),
  });
  expect(await repo.findPage('owner', { ...filter, limit: 2, offset: 8 }))
    .toEqual({ plans: [], total: 7 });
  const scopedWhere = { identityId: 'owner', deletedAt: null, ...where };
  expect(taskPlan.count).toHaveBeenCalledWith({ where: scopedWhere });
  expect(taskPlan.findMany).toHaveBeenCalledWith({
    where: scopedWhere,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 2,
    skip: 8,
  });
});
