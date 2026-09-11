/** End-to-end Task -> Goal V2 durable settlement integration. */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import type { TaskGoalProgressOutboxEventV2 } from '@memoflow/contracts/task';
import { Goal } from '../../domain/aggregates/goal';
import { GoalPrismaRepository } from '../../infrastructure/adapters/prisma/goal-prisma.repository';
import { GoalRecordPrismaRepository } from '../../infrastructure/adapters/prisma/goal-record-prisma.repository';
import { createGoalTaskProgressHandler } from './index';
import { PrismaGoalWriteTransactionRunner } from '../../infrastructure/adapters/prisma/prisma-goal-write-transaction-runner';
import { cleanAll, disconnectPrisma, getPrisma, seedAccount } from '../../../__tests__/integration-helpers';

async function waitFor<T>(probe: () => Promise<T | null | undefined>, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value != null) return value;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('GoalTaskProgressHandler V2 integration', () => {
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });
  beforeEach(async () => cleanAll());

  it('applies an explicit TaskOccurrence source once and reverts it explicitly', async () => {
    const prisma = await getPrisma();
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const goalRepository = new GoalPrismaRepository(prisma);
    const goalRecordRepository = new GoalRecordPrismaRepository(prisma);
    const handler = createGoalTaskProgressHandler(
      goalRepository,
      goalRecordRepository,
      new PrismaGoalWriteTransactionRunner(prisma),
    );

    const goal = Goal.create({
      identityId,
      name: 'Ship Wave 2',
      summary: null,
      startDate: null,
      reminderConfig: null,
    });
    const keyResult = goal.createAndAddKeyResult({
      title: 'Completed tasks',
      aggregationMethod: 'Sum',
      startingValue: 0,
      currentValue: 0,
      targetValue: 10,
      weight: 1,
      unit: 'tasks',
    });
    await goalRepository.save(goal);

    const readProgress = async () =>
      (await goalRepository.findByIdForIdentity(String(identityId), goal.id, { includeChildren: true }))
        ?.getKeyResult(String(keyResult.id))?.progress.currentValue;
    const waitForProgress = (expected: number) =>
      waitFor(async () => ((await readProgress()) === expected ? expected : null));

    const apply = (occurredAt: number): TaskGoalProgressOutboxEventV2 => ({
      eventId: `task-goal-apply:TaskOccurrence:ti-int-1:${occurredAt}`,
      schemaVersion: 2,
      eventType: 'task.goal-progress-requested',
      action: 'apply',
      identityId: identityId as never,
      taskOccurrenceId: 'ti-int-1' as never,
      taskPlanId: 'tt-int-1' as never,
      goalId: goal.id as never,
      keyResultId: keyResult.id as never,
      value: 3,
      source: { type: 'TaskOccurrence', id: 'ti-int-1' },
      taskTitle: 'Finish integration test',
      occurredAt,
    });
    const revert = (occurredAt: number): TaskGoalProgressOutboxEventV2 => ({
      eventId: `task-goal-revert:ti-int-1:${occurredAt}`,
      schemaVersion: 2,
      eventType: 'task.goal-progress-requested',
      action: 'revert',
      identityId: identityId as never,
      taskOccurrenceId: 'ti-int-1' as never,
      taskPlanId: 'tt-int-1' as never,
      sources: [
        { type: 'TaskOccurrence', id: 'ti-int-1' },
        { type: 'TaskPlan', id: 'tt-int-1' },
      ],
      occurredAt,
    });

    const t0 = Date.now();
    await handler.handle(apply(t0));
    expect(await waitForProgress(3)).toBe(3);
    await handler.handle(apply(t0));
    expect(await readProgress()).toBe(3);
    await handler.handle(revert(t0 + 1));
    expect(await waitForProgress(0)).toBe(0);
  });
});
