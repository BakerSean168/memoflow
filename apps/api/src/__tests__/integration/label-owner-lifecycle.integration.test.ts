import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@memoflow/database';
import { LabelService, PrismaLabelRepository } from '@memoflow/label';
import {
  cleanAll,
  disconnectPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { createFixedClock } from '@memoflow/time';

describe('API host Shared Label owner lifecycle', () => {
  beforeEach(async () => {
    await cleanAll();
  });

  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  it('keeps Goal/Task assignments stable across rename and cascades only joins on Label delete', async () => {
    const identityId = 'label-owner-lifecycle';
    const goalId = 'goal-label-owner-lifecycle';
    const taskPlanId = 'task-label-owner-lifecycle';
    await seedAccount({ id: identityId });
    await prisma.goal.create({ data: { id: goalId, identityId, name: 'Goal', status: 'Active' } });
    await prisma.taskPlan.create({
      data: { id: taskPlanId, identityId, name: 'Task', status: 'Active' },
    });

    const labels = new LabelService(new PrismaLabelRepository(prisma), {
      clock: createFixedClock(1_800_000_000_000),
      idFactory: () => 'label-stable-id',
    });
    const label = await labels.create({ identityId, name: 'Work', color: '#3B82F6' });

    await prisma.goalLabel.create({ data: { identityId, goalId, labelId: label.id } });
    await prisma.taskLabel.create({ data: { identityId, taskPlanId, labelId: label.id } });

    const renamed = await labels.update({ identityId, labelId: label.id, name: 'Deep Work' });
    expect(renamed).toMatchObject({ id: label.id, name: 'Deep Work', normalizedName: 'deep work' });

    await expect(
      prisma.goalLabel.findUniqueOrThrow({
        where: { identityId_goalId_labelId: { identityId, goalId, labelId: label.id } },
        include: { label: true },
      }),
    ).resolves.toMatchObject({ label: { id: label.id, name: 'Deep Work' } });
    await expect(
      prisma.taskLabel.findUniqueOrThrow({
        where: { identityId_taskPlanId_labelId: { identityId, taskPlanId, labelId: label.id } },
        include: { label: true },
      }),
    ).resolves.toMatchObject({ label: { id: label.id, name: 'Deep Work' } });

    await expect(labels.delete({ identityId, labelId: label.id })).resolves.toBe(true);
    await expect(prisma.goalLabel.count({ where: { identityId, goalId } })).resolves.toBe(0);
    await expect(prisma.taskLabel.count({ where: { identityId, taskPlanId } })).resolves.toBe(0);
    await expect(prisma.goal.count({ where: { id: goalId, identityId } })).resolves.toBe(1);
    await expect(prisma.taskPlan.count({ where: { id: taskPlanId, identityId } })).resolves.toBe(1);
  });
});
