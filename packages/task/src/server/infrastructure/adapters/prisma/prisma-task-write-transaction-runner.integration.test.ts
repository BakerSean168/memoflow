import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { IdentityId } from '@memoflow/domain-shared';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskGoalBindingTrigger, TaskPlanScheduleKind } from '@memoflow/contracts/task';
import { eventBus } from '@memoflow/utils/domain';
import { TaskPlan } from '../../../domain/aggregates/task-plan';
import { TaskOccurrence } from '../../../domain/aggregates/task-occurrence';
import {
  canonicalTaskOccurrenceScheduleForTest,
  canonicalTaskPlanScheduleForTest,
  aDailyRecurrence,
  anAllDayTiming,
  TASK_TEST_TIME_CONTEXT,
  TASK_TEST_USER_TIME_CONTEXT_PORT,
} from '../../../../testing';
import {
} from '../../../domain/value-objects';
import { createTaskPrismaModule } from '../../prisma';
import {
  cleanTaskTables,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../__tests__/integration-helpers';
import { PrismaTaskWriteTransactionRunner } from './prisma-task-write-transaction-runner';
import { TaskOccurrencePrismaRepository } from './task-occurrence-prisma.repository';
import { TaskPlanPrismaRepository } from './task-plan-prisma.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedPlanWithPropagationStates() {
  const identityId = IdentityId.generate();
  await seedAccount({ id: identityId });

  const prisma = await getPrisma();
  const module = createTaskPrismaModule(prisma, {
    userTimeContextPort: TASK_TEST_USER_TIME_CONTEXT_PORT,
  });
  const now = Date.now();
  const plan = TaskPlan.create({
    identityId,
    title: 'Propagation plan',
    schedule: canonicalTaskPlanScheduleForTest(
      TaskPlanScheduleKind.Recurring,
      now - 2 * DAY_MS,
      anAllDayTiming(),
      aDailyRecurrence(),
      TASK_TEST_TIME_CONTEXT,
    ),
    importance: ImportanceLevel.Moderate,
  });
  await module.taskPlanRepository.save(plan);

  const createInstance = (occurrenceDate: number) =>
    TaskOccurrence.create({
      planId: plan.id,
      identityId,
      scheduleSnapshot: canonicalTaskOccurrenceScheduleForTest(
        occurrenceDate,
        anAllDayTiming(),
        TASK_TEST_TIME_CONTEXT,
      ),
      importanceSnapshot: ImportanceLevel.Moderate,
    });
  const pastPending = createInstance(now - DAY_MS);
  const futurePending = createInstance(now + DAY_MS);
  const futureInProgress = createInstance(now + 2 * DAY_MS);
  futureInProgress.start();
  await module.taskOccurrenceRepository.saveMany([pastPending, futurePending, futureInProgress]);

  return {
    identityId,
    prisma,
    module,
    plan,
    pastPending,
    futurePending,
    futureInProgress,
  };
}

describe('PrismaTaskWriteTransactionRunner integration', () => {
  afterAll(async () => {
    await disconnectPrisma();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await cleanTaskTables();
  });

  it('publishes buffered domain events only after the transaction commits', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const runner = new PrismaTaskWriteTransactionRunner(prisma);
    const dispatchSpy = vi.spyOn(eventBus, 'dispatch').mockResolvedValue(undefined);
    const plan = TaskPlan.create({
      identityId,
    title: 'Daily Review',
    schedule: canonicalTaskPlanScheduleForTest(
        TaskPlanScheduleKind.Recurring,
        Date.now(),
        anAllDayTiming(),
        aDailyRecurrence(),
        TASK_TEST_TIME_CONTEXT,
      ),
      importance: ImportanceLevel.Moderate,
    });

    let sentBeforeCommit = false;

    await runner.run(async ({ planRepository }) => {
      await planRepository.save(plan);
      sentBeforeCommit = dispatchSpy.mock.calls.length > 0;
    });

    expect(sentBeforeCommit).toBe(false);
    // W5 metadata contract: the reliable delivery adapter passes envelope metadata
    // (aggregateId / occurredAt / optional idempotencyKey) as the 3rd arg.
    expect(dispatchSpy).toHaveBeenCalledWith(
      'task:created',
      expect.objectContaining({ planId: plan.id }),
      expect.objectContaining({
        aggregateId: expect.any(String),
        occurredAt: expect.any(Date),
      }),
    );

    const saved = await prisma.taskPlan.findUnique({
      where: { id: plan.id },
    });
    expect(saved).not.toBeNull();
  });

  it('rolls back createTaskPrismaModule writes and publishes nothing when occurrence persistence fails', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const module = createTaskPrismaModule(prisma, {
      userTimeContextPort: TASK_TEST_USER_TIME_CONTEXT_PORT,
    });
    const dispatchSpy = vi.spyOn(eventBus, 'dispatch').mockResolvedValue(undefined);
    vi.spyOn(TaskOccurrencePrismaRepository.prototype, 'saveMany').mockRejectedValue(
      new Error('saveMany failed'),
    );

    const result = await module.api.createTaskPlan({
      identityId,
    name: 'Daily Review',
    schedule: canonicalTaskPlanScheduleForTest(
        TaskPlanScheduleKind.Recurring,
        Date.now(),
        anAllDayTiming(),
        aDailyRecurrence(),
        TASK_TEST_TIME_CONTEXT,
      ).toDTO(),
      importance: ImportanceLevel.Moderate,
    });

    expect(result).toBeErrorWithCode('INTERNAL_ERROR');
    expect(await prisma.taskPlan.count()).toBe(0);
    expect(await prisma.taskOccurrence.count()).toBe(0);
    expect(dispatchSpy).not.toHaveBeenCalled();

    module.dispose();
  });

  it('propagates plan updates only to future pending occurrences through the production module', async () => {
    vi.spyOn(eventBus, 'dispatch').mockResolvedValue(undefined);
    const { identityId, prisma, module, plan, pastPending, futurePending, futureInProgress } =
      await seedPlanWithPropagationStates();

    const result = await module.api.updateTaskPlan(String(plan.id), String(identityId), {
      name: 'Updated propagation plan',
      importance: ImportanceLevel.Important,
    });

    expect(result.ok).toBe(true);
    const savedTemplate = await prisma.taskPlan.findUniqueOrThrow({
      where: { id: String(plan.id) },
    });
    const savedInstances = await module.taskOccurrenceRepository.findByPlanId(
      String(plan.id),
      String(identityId),
    );
    const savedById = new Map(savedInstances.map((occurrence) => [String(occurrence.id), occurrence]));

    expect(savedTemplate).toMatchObject({
      name: 'Updated propagation plan',
      importance: ImportanceLevel.Important,
    });
    expect(savedById.get(String(futurePending.id))?.importanceSnapshot).toBe(
      ImportanceLevel.Important,
    );
    expect(savedById.get(String(pastPending.id))?.importanceSnapshot).toBe(
      ImportanceLevel.Moderate,
    );
    expect(savedById.get(String(futureInProgress.id))).toMatchObject({
      importanceSnapshot: ImportanceLevel.Moderate,
      status: 'InProgress',
    });

    module.dispose();
  });

  it('rolls back future pending propagation when the plan write fails', async () => {
    vi.spyOn(eventBus, 'dispatch').mockResolvedValue(undefined);
    const { identityId, module, plan, futurePending } = await seedPlanWithPropagationStates();
    vi.spyOn(
      TaskPlanPrismaRepository.prototype as unknown as { persist: () => Promise<void> },
      'persist',
    ).mockRejectedValueOnce(new Error('plan persistence failed'));

    const result = await module.api.updateTaskPlan(String(plan.id), String(identityId), {
      name: 'Must roll back',
      importance: ImportanceLevel.Important,
    });

    expect(result).toBeErrorWithCode('INTERNAL_ERROR');
    const savedTemplate = await module.taskPlanRepository.findByIdForIdentity(
      String(identityId),
      String(plan.id),
    );
    const savedFuture = await module.taskOccurrenceRepository.findByIdForIdentity(
      String(identityId),
      String(futurePending.id),
    );
    expect(savedTemplate?.title).toBe('Propagation plan');
    expect(savedTemplate?.importance).toBe(ImportanceLevel.Moderate);
    expect(savedFuture?.importanceSnapshot).toBe(ImportanceLevel.Moderate);

    module.dispose();
  });

  it('rolls back plan, occurrences, outbox and publishes no events when taskGoalOutbox append fails', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();

    // Seed the Goal + KeyResult rows required by the goal-binding FK.
    const goalId = `goal-${Date.now()}`;
    const keyResultId = `kr-${Date.now()}`;
    await prisma.goal.create({
      data: {
        id: goalId,
        identityId,
        name: 'Outbox Rollback Goal',
        status: 'InProgress',
      },
    });
    await prisma.keyResult.create({
      data: {
        id: keyResultId,
        identityId,
        goalId,
        title: 'KR',
        aggregationMethod: 'Sum',
        initialValue: 0,
        trackingBaseValue: 0,
        currentValue: 0,
        targetValue: 10,
        weight: 1,
      },
    });
    const module = createTaskPrismaModule(prisma, {
      userTimeContextPort: TASK_TEST_USER_TIME_CONTEXT_PORT,
    });
    const dispatchSpy = vi.spyOn(eventBus, 'dispatch').mockResolvedValue(undefined);

  const createSchedule = canonicalTaskPlanScheduleForTest(
      TaskPlanScheduleKind.Recurring,
      Date.now(),
      anAllDayTiming(),
      aDailyRecurrence(),
      TASK_TEST_TIME_CONTEXT,
    );
    const createRes = await module.api.createTaskPlan({
      identityId,
      name: 'Goal Task',
      schedule: createSchedule.toDTO(),
      importance: ImportanceLevel.Moderate,
      goalBinding: {
        goalId,
        keyResultId,
        contribution: { value: 1, trigger: TaskGoalBindingTrigger.EachCompletion },
      },
    });
    expect(createRes.ok).toBe(true);
    if (!createRes.ok) return;

    const occurrences = await module.taskOccurrenceRepository.findByPlanId(
      createRes.data.plan.id,
      identityId,
    );
    expect(occurrences.length).toBeGreaterThan(0);
    const occurrenceId = String(occurrences[0].id);

    dispatchSpy.mockClear();

    // Fail the outbox write INSIDE the transaction: the runner uses the tx-bound
    // client (not the top-level prisma), so wrap $transaction with a Proxy tx.
    const realTransaction = prisma.$transaction.bind(prisma);
    let injected = false;
    vi.spyOn(prisma, '$transaction').mockImplementation((async (fn: unknown, opts?: unknown) => {
      return realTransaction(async (tx: any) => {
        if (!injected) {
          injected = true;
          const failingTx = new Proxy(tx, {
            get(target, prop) {
              if (prop === 'taskGoalOutbox') {
                const outbox = target.taskGoalOutbox;
                return new Proxy(outbox, {
                  get(t, p) {
                    if (p === 'createMany') {
                      return () => Promise.reject(new Error('Outbox write failure simulation'));
                    }
                    return (t as Record<string, unknown>)[p];
                  },
                });
              }
              return (target as Record<string, unknown>)[prop];
            },
          });
          return (fn as (t: unknown) => Promise<unknown>)(failingTx);
        }
        return (fn as (t: unknown) => Promise<unknown>)(tx);
      });
    }) as never);

    const result = await module.api.completeTaskOccurrence(occurrenceId, identityId);

    expect(result).toBeErrorWithCode('INTERNAL_ERROR');

    const instanceInDb = await prisma.taskOccurrence.findUnique({
      where: { id: occurrenceId },
    });
    expect(instanceInDb?.status).toBe('Pending');

    const outboxCount = await prisma.taskGoalOutbox.count({
      where: { taskOccurrenceId: occurrenceId },
    });
    expect(outboxCount).toBe(0);

    expect(dispatchSpy).not.toHaveBeenCalled();

    module.dispose();
  });
});
