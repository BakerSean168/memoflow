import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import {
  cleanTaskTables,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../__tests__/integration-helpers';
import { PrismaTaskBindingReadPort } from './prisma-task-binding-read-port';
import { GoalTaskBindingQueryInputSchema } from '@memoflow/contracts/reliable-messaging';

describe('PrismaTaskBindingReadPort (W4 P2-3)', () => {
  beforeAll(async () => {
    const prisma = await getPrisma();
    await prisma.$executeRawUnsafe('TRUNCATE task_templates CASCADE');
  });

  afterAll(async () => {
    const prisma = await getPrisma();
    await prisma.$executeRawUnsafe('TRUNCATE task_templates CASCADE');
  });

  it('counts active bindings per goal with identity isolation', async () => {
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
    const now = new Date();

    await prisma.goal.createMany({
      data: [
        { id: goalA, identityId: identityA, name: 'Goal A', status: 'InProgress' },
        { id: goalB, identityId: identityA, name: 'Goal B', status: 'InProgress' },
        { id: foreignGoal, identityId: identityB, name: 'Foreign goal', status: 'InProgress' },
      ],
    });
    await prisma.keyResult.createMany({
      data: [
        { id: keyResultA, identityId: identityA, goalId: goalA, title: 'KR A', aggregationMethod: 'Sum', initialValue: 0, trackingBaseValue: 0, currentValue: 0, targetValue: 1, weight: 1 },
        { id: keyResultB, identityId: identityA, goalId: goalB, title: 'KR B', aggregationMethod: 'Sum', initialValue: 0, trackingBaseValue: 0, currentValue: 0, targetValue: 1, weight: 1 },
        { id: foreignKeyResult, identityId: identityB, goalId: foreignGoal, title: 'Foreign KR', aggregationMethod: 'Sum', initialValue: 0, trackingBaseValue: 0, currentValue: 0, targetValue: 1, weight: 1 },
      ],
    });

    await prisma.taskPlan.createMany({
      data: [
        { id: `tpl-a1`, identityId: identityA, name: 'A1', status: 'Active', goalId: goalA, keyResultId: keyResultA, createdAt: now, updatedAt: now },
        { id: `tpl-a2`, identityId: identityA, name: 'A2', status: 'Active', goalId: goalA, keyResultId: keyResultA, createdAt: now, updatedAt: now },
        { id: `tpl-a3`, identityId: identityA, name: 'A3', status: 'Active', goalId: goalB, keyResultId: keyResultB, createdAt: now, updatedAt: now },
        { id: `tpl-a4`, identityId: identityA, name: 'A4 (soft-deleted)', status: 'Archived', goalId: goalA, keyResultId: keyResultA, createdAt: now, updatedAt: now, deletedAt: new Date(now.getTime() + 1000) },
        { id: `tpl-b1`, identityId: identityB, name: 'B1', status: 'Active', goalId: foreignGoal, keyResultId: foreignKeyResult, createdAt: now, updatedAt: now },
      ],
    });

    const port = new PrismaTaskBindingReadPort(prisma);

    const a1 = await port.checkActiveTaskBindings({ identityId: identityA, goalId: goalA });
    expect(a1).toEqual({ hasActiveBindings: true, activeCount: 2 });

    const aGoalB = await port.checkActiveTaskBindings({ identityId: identityA, goalId: goalB });
    expect(aGoalB).toEqual({ hasActiveBindings: true, activeCount: 1 });

    // Identity isolation: identityA cannot see identityB's independently owned Goal binding.
    const aForeignGoal = await port.checkActiveTaskBindings({ identityId: identityA, goalId: foreignGoal });
    expect(aForeignGoal).toEqual({ hasActiveBindings: false, activeCount: 0 });

    const bForeignGoal = await port.checkActiveTaskBindings({ identityId: identityB, goalId: foreignGoal });
    expect(bForeignGoal).toEqual({ hasActiveBindings: true, activeCount: 1 });

    const none = await port.checkActiveTaskBindings({ identityId: identityA, goalId: 'goal-missing' });
    expect(none).toEqual({ hasActiveBindings: false, activeCount: 0 });
  });

  it('validates input through the frozen GoalTaskBindingQueryInputSchema', async () => {
    const prisma = await getPrisma();
    const port = new PrismaTaskBindingReadPort(prisma);

    // Invalid input (missing identityId) must fail schema validation
    await expect(
      port.checkActiveTaskBindings({ identityId: '', goalId: 'goal-x' } as never),
    ).rejects.toThrow();
    expect(GoalTaskBindingQueryInputSchema.parse({ identityId: 'i', goalId: 'g' })).toBeTruthy();
  });
});
