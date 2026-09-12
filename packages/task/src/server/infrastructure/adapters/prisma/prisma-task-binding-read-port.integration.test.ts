import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import { GoalTaskBindingQueryInputSchema } from '@memoflow/contracts/reliable-messaging';
import { getPrisma, seedAccount } from '../../../../__tests__/integration-helpers';
import { PrismaTaskBindingReadPort } from './prisma-task-binding-read-port';

describe('PrismaTaskBindingReadPort', () => {
  beforeAll(async () => {
    const prisma = await getPrisma();
    await prisma.$executeRawUnsafe('TRUNCATE task_templates CASCADE');
  });

  afterAll(async () => {
    const prisma = await getPrisma();
    await prisma.$executeRawUnsafe('TRUNCATE task_templates CASCADE');
  });

  it('serves identity-scoped Goal/KR context including Goal-only links and summary', async () => {
    const prisma = await getPrisma();
    const identityA = IdentityId.generate();
    const identityB = IdentityId.generate();
    await seedAccount({ id: identityA });
    await seedAccount({ id: identityB });

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const goalA = `goal-a-${suffix}`;
    const goalB = `goal-b-${suffix}`;
    const foreignGoal = `goal-foreign-${suffix}`;
    const keyResultA = `kr-a-${suffix}`;
    const keyResultB = `kr-b-${suffix}`;
    const foreignKeyResult = `kr-foreign-${suffix}`;
    const createdAt = (offset: number) => new Date(1_700_000_000_000 + offset);

    await prisma.goal.createMany({
      data: [
        { id: goalA, identityId: identityA, name: 'Goal A', status: 'InProgress' },
        { id: goalB, identityId: identityA, name: 'Goal B', status: 'InProgress' },
        { id: foreignGoal, identityId: identityB, name: 'Foreign goal', status: 'InProgress' },
      ],
    });
    await prisma.keyResult.createMany({
      data: [
        {
          id: keyResultA,
          identityId: identityA,
          goalId: goalA,
          title: 'KR A',
          aggregationMethod: 'Sum',
          initialValue: 0,
          trackingBaseValue: 0,
          currentValue: 0,
          targetValue: 1,
          weight: 1,
        },
        {
          id: keyResultB,
          identityId: identityA,
          goalId: goalB,
          title: 'KR B',
          aggregationMethod: 'Sum',
          initialValue: 0,
          trackingBaseValue: 0,
          currentValue: 0,
          targetValue: 1,
          weight: 1,
        },
        {
          id: foreignKeyResult,
          identityId: identityB,
          goalId: foreignGoal,
          title: 'Foreign KR',
          aggregationMethod: 'Sum',
          initialValue: 0,
          trackingBaseValue: 0,
          currentValue: 0,
          targetValue: 1,
          weight: 1,
        },
      ],
    });

    await prisma.taskPlan.createMany({
      data: [
        {
          id: 'tpl-goal-only',
          identityId: identityA,
          name: 'Goal only',
          status: 'Active',
          outcome: 'Open',
          goalId: goalA,
          keyResultId: null,
          createdAt: createdAt(1),
          updatedAt: createdAt(1),
        },
        {
          id: 'tpl-kr-active',
          identityId: identityA,
          name: 'KR active',
          status: 'Active',
          outcome: 'Open',
          goalId: goalA,
          keyResultId: keyResultA,
          createdAt: createdAt(2),
          updatedAt: createdAt(2),
        },
        {
          id: 'tpl-kr-completed',
          identityId: identityA,
          name: 'KR completed',
          status: 'Closed',
          outcome: 'Succeeded',
          goalId: goalA,
          keyResultId: keyResultA,
          goalRecordValue: 2,
          goalProgressTrigger: 'PlanCompletion',
          createdAt: createdAt(3),
          updatedAt: createdAt(3),
        },
        {
          id: 'tpl-goal-b',
          identityId: identityA,
          name: 'Other goal',
          status: 'Active',
          outcome: 'Open',
          goalId: goalB,
          keyResultId: keyResultB,
          createdAt: createdAt(4),
          updatedAt: createdAt(4),
        },
        {
          id: 'tpl-soft-deleted',
          identityId: identityA,
          name: 'Soft deleted',
          status: 'Active',
          outcome: 'Open',
          goalId: goalA,
          keyResultId: keyResultA,
          createdAt: createdAt(5),
          updatedAt: createdAt(5),
          deletedAt: createdAt(6),
        },
        {
          id: 'tpl-foreign',
          identityId: identityB,
          name: 'Foreign',
          status: 'Active',
          outcome: 'Open',
          goalId: foreignGoal,
          keyResultId: foreignKeyResult,
          createdAt: createdAt(6),
          updatedAt: createdAt(6),
        },
      ],
    });

    const port = new PrismaTaskBindingReadPort(prisma);

    await expect(
      port.checkActiveTaskBindings({ identityId: identityA, goalId: goalA }),
    ).resolves.toEqual({ hasActiveBindings: true, activeCount: 3 });

    const page = await port.listTasksByGoal(identityA, goalA, { limit: 2, offset: 0 });
    expect(page).toMatchObject({ total: 3, limit: 2, offset: 0 });
    expect(page.items.map((item) => item.taskPlanId)).toEqual([
      'tpl-kr-completed',
      'tpl-kr-active',
    ]);

    const krPage = await port.listTasksByKeyResult(identityA, goalA, keyResultA);
    expect(krPage.total).toBe(2);
    expect(krPage.items.every((item) => item.keyResultId === keyResultA)).toBe(true);
    expect(krPage.items.some((item) => item.hasContribution)).toBe(true);

    await expect(port.getTaskGoalContextSummary(identityA, goalA)).resolves.toEqual({
      total: 3,
      active: 2,
      completed: 1,
      goalLevel: 1,
      byKeyResult: [{ keyResultId: keyResultA, total: 2, active: 1 }],
    });

    await expect(port.listTasksByGoal(identityA, foreignGoal)).resolves.toMatchObject({ total: 0 });
  });

  it('requires validated owner scope for Goal and Key Result reads', async () => {
    const prisma = await getPrisma();
    const port = new PrismaTaskBindingReadPort(prisma);

    await expect(
      port.checkActiveTaskBindings({ identityId: '', goalId: 'goal-x' } as never),
    ).rejects.toThrow();
    await expect(port.listTasksByKeyResult('identity-x', 'goal-x', '')).rejects.toThrow(
      /keyResultId is required/,
    );
    expect(GoalTaskBindingQueryInputSchema.parse({ identityId: 'i', goalId: 'g' })).toBeTruthy();
  });
});
