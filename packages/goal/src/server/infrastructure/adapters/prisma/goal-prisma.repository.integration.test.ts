import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@memoflow/database';
import { IdentityId } from '@memoflow/domain-shared';
import { createTimeContext } from '@memoflow/time';
import { Goal } from '../../../domain/aggregates/goal';
import { GoalLabelOwnershipError, GoalReminderConfig } from '../../../domain';
import { GoalPrismaRepository } from './goal-prisma.repository';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../__tests__/integration-helpers';

function createIntegrationGoal(identityId: string) {
  const goal = Goal.create({
    identityId: identityId as IdentityId,
    name: 'Harden AI Oracle',
    description: 'Turn persistence tests into a reliable oracle',
    feasibilityAnalysis: null,
    motivation: 'Protect structural refactors',
    startDate: new Date('2026-04-01T00:00:00.000Z').getTime(),
    dueDate: new Date('2026-05-01T00:00:00.000Z').getTime(),
    reminderConfig: GoalReminderConfig.create({
      enabled: true,
      triggers: [
        { type: 'RemainingDays', value: 7, enabled: true },
        { type: 'ProgressPercentage', value: 50, enabled: false },
      ],
    }),
  });

  const keyResult = goal.createAndAddKeyResult({
    title: 'Add first DB oracle',
    description: 'Persist repository state and relations',
    aggregationMethod: 'Last',
    targetValue: 10,
    currentValue: 4,
    unit: 'tests',
    weight: 3,
  });

  goal.createAndAddReview({
    reflection: 'The first persistence oracle is in place.',
    challenges: 'Need more frontend oracle depth',
    adjustments: 'Expand boundary tests',
    systemContext: {
      windowStartAt: Date.UTC(2026, 3, 1),
      windowEndAt: Date.UTC(2026, 3, 8),
      overallProgress: { startPercentage: 20, endPercentage: 40, deltaPercentage: 20 },
      keyResults: [],
      summary: { recordCount: 1, manualRecordCount: 1, taskContributionCount: 0 },
    },
  });
  goal.recordWeightSnapshot(String(keyResult.id), 2, 3, 'Manual', identityId, 'scope changed');

  return goal;
}

describe('GoalPrismaRepository integration', () => {
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanAll();
  });

  it('persists and reloads goal children, enum state, JSON config, and nullable fields', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new GoalPrismaRepository(prisma);
    const goal = createIntegrationGoal(identityId);

    await repository.save(goal);

    const row = await prisma.goal.findUnique({
      where: { id: String(goal.id) },
      include: {
        keyResults: true,
        reviews: true,
        keyResultWeightSnapshots: true,
      },
    });
    const loaded = await repository.findByIdForIdentity(String(identityId), String(goal.id), {
      includeChildren: true,
    });

    expect(row).not.toBeNull();
    expect(row?.reminderConfig).toContain('RemainingDays');
    expect(row?.keyResults).toHaveLength(1);
    expect(row?.reviews).toHaveLength(1);
    expect(row?.keyResultWeightSnapshots).toHaveLength(1);

    expect(loaded).not.toBeNull();
    expect(loaded?.identityId).toBe(identityId);
    expect(loaded?.dueDate).toBe(new Date('2026-05-01T00:00:00.000Z').getTime());
    expect('importance' in (loaded as object)).toBe(false);
    expect(loaded?.reminderConfig?.enabled).toBe(true);
    expect(loaded?.reminderConfig?.triggers).toHaveLength(2);
    expect(loaded?.keyResults).toHaveLength(1);
    expect(loaded?.goalReviews).toHaveLength(1);
    expect(loaded?.goalReviews[0]?.reflection).toBe('The first persistence oracle is in place.');
    expect(loaded?.goalReviews[0]?.systemContext.overallProgress.endPercentage).toBe(40);
    expect(loaded?.weightSnapshots).toHaveLength(1);
    expect(loaded?.keyResults[0]?.progress.targetValue).toBe(10);
    expect(loaded?.calculateProgress()).toBe(40);
  });

  it('persists shared Goal labels, returns labels[] and filters with strict AND + identity isolation', async () => {
    const identityId = IdentityId.generate();
    const otherIdentityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedAccount({ id: otherIdentityId });
    const prisma = await getPrisma();
    const repository = new GoalPrismaRepository(prisma);

    const goal = createIntegrationGoal(identityId);
    const second = Goal.create({
      identityId: identityId as IdentityId,
      name: 'Only work label',
      description: null,
      feasibilityAnalysis: null,
      motivation: null,
      startDate: null,
      dueDate: null,
      reminderConfig: null,
    });
    await repository.save(goal);
    await repository.save(second);

    const work = await prisma.label.create({
      data: {
        id: `label-work-${Date.now()}`,
        identityId,
        name: '#工作',
        normalizedName: '#工作',
      },
    });
    const ai = await prisma.label.create({
      data: {
        id: `label-ai-${Date.now()}`,
        identityId,
        name: '#AI',
        normalizedName: '#ai',
      },
    });
    const foreign = await prisma.label.create({
      data: {
        id: `label-foreign-${Date.now()}`,
        identityId: otherIdentityId,
        name: '#Foreign',
        normalizedName: '#foreign',
      },
    });

    await repository.replaceLabels(identityId, String(goal.id), [work.id, ai.id]);
    await repository.replaceLabels(identityId, String(second.id), [work.id]);

    const loaded = await repository.findByIdForIdentity(identityId, String(goal.id), {
      includeChildren: true,
    });
    expect(loaded?.labels.map((label) => label.id).sort()).toEqual([ai.id, work.id].sort());

    const both = await repository.findByIdentityId(identityId, {
      includeChildren: false,
      labelIdsAll: [work.id, ai.id],
    });
    expect(both.map((candidate) => String(candidate.id))).toEqual([String(goal.id)]);

    await expect(
      repository.replaceLabels(identityId, String(goal.id), [foreign.id]),
    ).rejects.toBeInstanceOf(GoalLabelOwnershipError);
  });

  it('lists goals by identity without leaking other accounts', async () => {
    const identityId = IdentityId.generate();
    const otherIdentityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedAccount({ id: otherIdentityId });

    const prisma = await getPrisma();
    const repository = new GoalPrismaRepository(prisma);

    const firstGoal = createIntegrationGoal(identityId);
    const secondGoal = Goal.create({
      identityId: identityId as IdentityId,
      name: 'Keep default E2E small',
      description: null,
      feasibilityAnalysis: null,
      motivation: null,
      startDate: null,
      dueDate: null,
      reminderConfig: null,
    });
    const foreignGoal = Goal.create({
      identityId: otherIdentityId as IdentityId,
      name: 'Foreign goal',
      description: null,
      feasibilityAnalysis: null,
      motivation: null,
      startDate: null,
      dueDate: null,
      reminderConfig: null,
    });

    await repository.save(firstGoal);
    await repository.save(secondGoal);
    await repository.save(foreignGoal);

    const goals = await repository.findByIdentityId(identityId, { includeChildren: true });

    expect(goals).toHaveLength(2);
    expect(goals.map((goal) => goal.name)).toEqual(
      expect.arrayContaining(['Harden AI Oracle', 'Keep default E2E small']),
    );
    expect(goals.every((goal) => goal.identityId === identityId)).toBe(true);
  });
});

describe('Goal durable completion receipt idempotency (W4 P1-3)', () => {
  const identityId = `IdentityId_receipt_${Date.now()}`;
  let goalId: string;

  beforeEach(async () => {
    await prisma.cloudAuthUser
      .create({
        data: {
          id: identityId,
          email: `${identityId}@example.com`,
          name: 'Receipt Test User',
          emailVerified: true,
        },
      })
      .catch(() => undefined);
    await prisma.account.upsert({
      where: { id: identityId },
      update: {},
      create: {
        id: identityId,
        status: 'Active',
        profile: {},
      },
    });
    goalId = `goal-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await prisma.goal.create({
      data: {
        id: goalId,
        identityId,
        name: 'Receipt Idempotency Goal',
        description: 'W4 receipt persistence evidence',
        status: 'Active',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  });

  it('repeat completion writes the durable receipt only once (idempotency key persisted)', async () => {
    const { PrismaGoalWriteTransactionRunner } =
      await import('./prisma-goal-write-transaction-runner');
    const { GoalPrismaRepository } = await import('./goal-prisma.repository');
    const { CompleteGoalUseCase } =
      await import('../../../application/use-cases/commands/complete-goal.use-case');
    const { GoalPolicy } = await import('../../../domain');

    const repository = new GoalPrismaRepository(prisma);
    const runner = new PrismaGoalWriteTransactionRunner(prisma);
    const useCase = new CompleteGoalUseCase(repository, new GoalPolicy(), runner);

    const first = await useCase.execute(goalId, identityId, 1);
    expect(first.ok).toBe(true);

    const second = await useCase.execute(goalId, identityId, 1);
    expect(second.ok).toBe(true);

    // Persistence evidence: exactly ONE durable outbox row for this idempotency key
    const key = `v1:${identityId.length}:${identityId}:4:goal:${`completed:${goalId}`.length}:completed:${goalId}`;
    const rows = await prisma.outboxMessage.findMany({
      where: { idempotencyKey: key },
    });
    expect(rows).toHaveLength(1);

    const keyRows = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS c FROM reliable_outbox_messages WHERE idempotency_key = $1`,
      key,
    );
    expect((keyRows as { c: number }[])[0].c).toBe(1);
  });

  it('repeat archiving writes the durable receipt only once (archive symmetric path)', async () => {
    const { PrismaGoalWriteTransactionRunner } =
      await import('./prisma-goal-write-transaction-runner');
    const { GoalPrismaRepository } = await import('./goal-prisma.repository');
    const { ArchiveGoalUseCase } =
      await import('../../../application/use-cases/commands/archive-goal.use-case');
    const { GoalPolicy } = await import('../../../domain');

    const repository = new GoalPrismaRepository(prisma);
    const runner = new PrismaGoalWriteTransactionRunner(prisma);
    const useCase = new ArchiveGoalUseCase(repository, new GoalPolicy(), runner);

    const first = await useCase.execute(goalId, identityId, 1);
    expect(first.ok).toBe(true);

    const second = await useCase.execute(goalId, identityId, 1);
    expect(second.ok).toBe(true);

    const key = `v1:${identityId.length}:${identityId}:4:goal:${`archived:${goalId}`.length}:archived:${goalId}`;
    const rows = await prisma.outboxMessage.findMany({
      where: { idempotencyKey: key },
    });
    expect(rows).toHaveLength(1);
  });

  it('receipt failure rolls back goal CAS save in transaction', async () => {
    const { PrismaGoalWriteTransactionRunner } =
      await import('./prisma-goal-write-transaction-runner');
    const { GoalPrismaRepository } = await import('./goal-prisma.repository');
    const { CompleteGoalUseCase } =
      await import('../../../application/use-cases/commands/complete-goal.use-case');
    const { GoalPolicy } = await import('../../../domain');

    const repository = new GoalPrismaRepository(prisma);
    const runner = new PrismaGoalWriteTransactionRunner(prisma);
    const useCase = new CompleteGoalUseCase(repository, new GoalPolicy(), runner);

    // Mock recordGoalCompletionReceipt inside runner to throw error
    const failingRunner: typeof runner = {
      run: async (work) => {
        return runner.run(async (ctx) => {
          await work({
            ...ctx,
            recordGoalCompletionReceipt: async () => {
              throw new Error('Simulated receipt write failure');
            },
          });
        });
      },
    };

    const failingUseCase = new CompleteGoalUseCase(repository, new GoalPolicy(), failingRunner);

    await expect(failingUseCase.execute(goalId, identityId, 1)).rejects.toThrow(
      'Simulated receipt write failure',
    );

    // Assert goal was NOT updated in DB (remains Active)
    const goalInDb = await prisma.goal.findUnique({ where: { id: goalId } });
    expect(goalInDb?.status).toBe('Active');
    expect(goalInDb?.completedAt).toBeNull();
  });
});

describe('GoalApiModule.register() lifecycle (W4 P2-1)', () => {
  it('registers routes and starts the module with the host-injected Task binding port', async () => {
    const { Router } = await import('express');
    const { createGoalApiModule } = await import('../../../../api/module');
    const { createGoalPrismaRepositories } = await import('../../prisma');
    const { createGoalModule } = await import('../../goal.module');
    const { createGoalEventListenersRuntime, createGoalRuntimeContribution } =
      await import('../../runtime');

    const repositories = createGoalPrismaRepositories(prisma);
    const listenerRuntime = createGoalEventListenersRuntime({
      goalRepository: repositories.goalRepository,
      goalRecordRepository: repositories.goalRecordRepository,
      goalWriteTransactionRunner: repositories.goalWriteTransactionRunner,
    });
    const instance = createGoalModule({
      ...repositories,
      taskBindingReadPort: {
        checkActiveTaskBindings: async () => ({ hasActiveBindings: false, activeCount: 0 }),
      },
      userTimeContextPort: {
        getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      },
      runtimeContributions: [createGoalRuntimeContribution(), listenerRuntime],
    });
    const module = createGoalApiModule({ instance });

    const router = Router();

    expect(() =>
      module.register({
        router,
        middleware: {
          auth: (() => undefined) as never,
          requireRole: () => (() => undefined) as never,
        },
      } as never),
    ).not.toThrow();

    // Routes were actually registered on the shared router
    const routeCount = router.stack.length;
    expect(routeCount).toBeGreaterThan(0);

    module.destroy?.();
  });
});
