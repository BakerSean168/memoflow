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

    const goalA = 'goal-a';
    const goalB = 'goal-b';
    const now = new Date();

    await prisma.taskTemplate.createMany({
      data: [
        { id: `tpl-a1`, identityId: identityA, name: 'A1', status: 'Active', goalId: goalA, createdAt: now, updatedAt: now },
        { id: `tpl-a2`, identityId: identityA, name: 'A2', status: 'Active', goalId: goalA, createdAt: now, updatedAt: now },
        { id: `tpl-a3`, identityId: identityA, name: 'A3', status: 'Active', goalId: goalB, createdAt: now, updatedAt: now },
        { id: `tpl-a4`, identityId: identityA, name: 'A4 (soft-deleted)', status: 'Archived', goalId: goalA, createdAt: now, updatedAt: now, deletedAt: new Date(now.getTime() + 1000) },
        { id: `tpl-b1`, identityId: identityB, name: 'B1', status: 'Active', goalId: goalA, createdAt: now, updatedAt: now },
      ],
    });

    const port = new PrismaTaskBindingReadPort(prisma);

    const a1 = await port.checkActiveTaskBindings({ identityId: identityA, goalId: goalA });
    expect(a1).toEqual({ hasActiveBindings: true, activeCount: 2 });

    // Identity isolation: identityB's binding to goalA is NOT visible to identityA
    const aGoalB = await port.checkActiveTaskBindings({ identityId: identityA, goalId: goalB });
    expect(aGoalB).toEqual({ hasActiveBindings: true, activeCount: 1 });

    const bGoalA = await port.checkActiveTaskBindings({ identityId: identityB, goalId: goalA });
    expect(bGoalA).toEqual({ hasActiveBindings: true, activeCount: 1 });

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
