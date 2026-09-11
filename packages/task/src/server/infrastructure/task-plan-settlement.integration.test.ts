import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import {
  TaskGoalBindingTrigger,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  TaskType,
} from '@memoflow/contracts/task';
import { TaskPlan } from '../domain/aggregates/task-plan';
import { TaskOccurrence } from '../domain/aggregates/task-occurrence';
import { TASK_TEST_TIME_CONTEXT, TASK_TEST_USER_TIME_CONTEXT_PORT } from '../../testing';
import { RecurrenceRule, TaskPlanSchedule, TaskTimeConfig } from '../domain/value-objects';
import { createTaskPrismaModule } from './prisma';
import {
  cleanTaskTables,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../__tests__/integration-helpers';

const DAY_MS = 24 * 60 * 60 * 1000;

type SeededPlan = Awaited<ReturnType<typeof seedFifteenOccurrencePlan>>;

async function seedFifteenOccurrencePlan(
  completionPolicy: (typeof TaskPlanCompletionPolicy)[keyof typeof TaskPlanCompletionPolicy],
): Promise<{
  identityId: IdentityId;
  module: ReturnType<typeof createTaskPrismaModule>;
  template: TaskPlan;
  finalInstance: TaskOccurrence;
}> {
  const identityId = IdentityId.generate();
  await seedAccount({ id: identityId });
  const prisma = await getPrisma();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const goalId = `goal-${suffix}`;
  const keyResultId = `kr-${suffix}`;

  await prisma.goal.create({
    data: { id: goalId, identityId, name: 'Graduation requirement', status: 'InProgress' },
  });
  await prisma.keyResult.create({
    data: {
      id: keyResultId,
      identityId,
      goalId,
      title: 'Second-class credits',
      aggregationMethod: 'Sum',
      startingValue: 40,
      currentValue: 40,
      targetValue: 50,
      weight: 1,
    },
  });

  const module = createTaskPrismaModule(prisma, {
    userTimeContextPort: TASK_TEST_USER_TIME_CONTEXT_PORT,
  });
  const start = Date.now() - 14 * DAY_MS;
  const template = TaskPlan.create({
    identityId,
    title: 'Plant check-in 15-day plan',
    schedule: TaskPlanSchedule.fromLegacy(
      TaskType.Recurring,
      TaskTimeConfig.createAllDay(new Date(start)),
      RecurrenceRule.createDaily(1).setOccurrences(15),
      TASK_TEST_TIME_CONTEXT,
    ),
    importance: ImportanceLevel.Moderate,
    completionPolicy,
    goalBinding: {
      goalId,
      keyResultId,
      contribution: { value: 1, trigger: TaskGoalBindingTrigger.PlanCompletion },
    },
  });
  template.clearDomainEvents();
  await module.taskPlanRepository.save(template);

  const instances: TaskOccurrence[] = [];
  for (let index = 0; index < 15; index += 1) {
    const instance = TaskOccurrence.create({
      timeContext: TASK_TEST_TIME_CONTEXT,
      templateId: template.id,
      identityId,
      instanceDate: start + index * DAY_MS,
      timeConfig: TaskTimeConfig.createAllDay(new Date(start + index * DAY_MS)),
      importance: ImportanceLevel.Moderate,
    });
    if (index < 14) instance.complete();
    instance.clearDomainEvents();
    instances.push(instance);
  }
  await module.taskOccurrenceRepository.saveMany(instances);

  return { identityId, module, template, finalInstance: instances[14] };
}

async function loadOutcome(seed: SeededPlan) {
  const saved = await seed.module.taskPlanRepository.findByIdForIdentity(
    String(seed.identityId),
    String(seed.template.id),
  );
  return saved?.outcome;
}

describe('SETTLE-3501 finite-plan durable settlement', () => {
  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanTaskTables();
  });

  it('Fixture A: waived final occurrence closes the 15-day plan as Succeeded and enqueues one TaskPlan settlement', async () => {
    const seed = await seedFifteenOccurrencePlan(TaskPlanCompletionPolicy.AllowCorrection);
    const prisma = await getPrisma();

    expect(
      await prisma.taskGoalOutbox.count({ where: { taskPlanId: String(seed.template.id) } }),
    ).toBe(0);

    const result = await seed.module.api.skipTaskOccurrence(
      String(seed.finalInstance.id),
      String(seed.identityId),
      { reason: 'official waiver' },
    );

    expect(result.ok).toBe(true);
    expect(await loadOutcome(seed)).toBe(TaskPlanOutcome.Succeeded);
    const rows = await prisma.taskGoalOutbox.findMany({
      where: { taskPlanId: String(seed.template.id) },
    });
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].payload)).toMatchObject({
      schemaVersion: 2,
      action: 'apply',
      source: { type: 'TaskPlan', id: String(seed.template.id) },
      value: 1,
    });

    seed.module.dispose();
  });

  it('Fixture A: 15/15 settles once, uncomplete reverts, and correction can settle the plan again', async () => {
    const seed = await seedFifteenOccurrencePlan(TaskPlanCompletionPolicy.AllowCorrection);
    const prisma = await getPrisma();
    const where = { taskPlanId: String(seed.template.id) };

    expect(await prisma.taskGoalOutbox.count({ where })).toBe(0);
    expect(
      (
        await seed.module.api.completeTaskOccurrence(
          String(seed.finalInstance.id),
          String(seed.identityId),
        )
      ).ok,
    ).toBe(true);
    expect(await loadOutcome(seed)).toBe(TaskPlanOutcome.Succeeded);

    const firstApply = (await prisma.taskGoalOutbox.findMany({ where }))
      .map((row) => ({ row, payload: JSON.parse(row.payload) as Record<string, unknown> }))
      .find(({ payload }) => payload.action === 'apply');
    expect(firstApply?.payload).toMatchObject({
      source: { type: 'TaskPlan', id: String(seed.template.id) },
    });

    expect(
      (
        await seed.module.api.uncompleteTaskOccurrence(
          String(seed.finalInstance.id),
          String(seed.identityId),
        )
      ).ok,
    ).toBe(true);
    expect(await loadOutcome(seed)).toBe(TaskPlanOutcome.Open);
    const afterRevert = (await prisma.taskGoalOutbox.findMany({ where })).map((row) => ({
      row,
      payload: JSON.parse(row.payload) as { action?: string; sources?: Array<{ type?: string }> },
    }));
    expect(
      afterRevert.some(
        ({ payload }) =>
          payload.action === 'revert' &&
          payload.sources?.some((source) => source.type === 'TaskPlan'),
      ),
    ).toBe(true);

    expect(
      (
        await seed.module.api.completeTaskOccurrence(
          String(seed.finalInstance.id),
          String(seed.identityId),
        )
      ).ok,
    ).toBe(true);
    expect(await loadOutcome(seed)).toBe(TaskPlanOutcome.Succeeded);
    const planApplyIds = (await prisma.taskGoalOutbox.findMany({ where }))
      .filter((row) => {
        const payload = JSON.parse(row.payload) as { action?: string; source?: { type?: string } };
        return payload.action === 'apply' && payload.source?.type === 'TaskPlan';
      })
      .map((row) => row.eventId);
    expect(planApplyIds).toHaveLength(2);
    expect(new Set(planApplyIds).size).toBe(2);

    seed.module.dispose();
  });

  it('Fixture A: strict final Missed closes the 15-day plan as Failed and never enqueues Goal settlement', async () => {
    const seed = await seedFifteenOccurrencePlan(TaskPlanCompletionPolicy.StrictNoBackfill);
    const prisma = await getPrisma();

    const result = await seed.module.api.markTaskOccurrenceMissed(
      String(seed.finalInstance.id),
      String(seed.identityId),
      { reason: 'confirmed missed' },
    );

    expect(result.ok).toBe(true);
    expect(await loadOutcome(seed)).toBe(TaskPlanOutcome.Failed);
    expect(
      await prisma.taskGoalOutbox.count({
        where: { taskPlanId: String(seed.template.id) },
      }),
    ).toBe(0);

    seed.module.dispose();
  });
});
