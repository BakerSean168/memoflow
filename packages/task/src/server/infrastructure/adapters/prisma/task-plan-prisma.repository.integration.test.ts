import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  aDailyRecurrence,
  aWeeklyRecurrence,
  aTimePointTiming,
  canonicalTaskPlanScheduleForTest,
  anAllDayTiming,
  TASK_TEST_TIME_CONTEXT,
} from '../../../../testing';
import { IdentityId } from '@memoflow/domain-shared';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskPlanScheduleKind, type TaskRecurrence, type TaskTiming } from '@memoflow/contracts/task';
import { TaskPlan } from '../../../domain/aggregates/task-plan';
import { TaskPlanPrismaRepository } from './task-plan-prisma.repository';
import { TaskLabelOwnershipError } from '../../../domain/repositories/i-task-plan-repository';
import {
  cleanTaskTables,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../__tests__/integration-helpers';

function createOneTimePlanForTest(params: {
  identityId: IdentityId;
  title: string;
  description?: string;
  importance?: ImportanceLevel;
  startDate?: number;
}) {
  return TaskPlan.create({
    identityId: params.identityId,
    title: params.title,
    description: params.description,
    importance: params.importance,
    schedule: canonicalTaskPlanScheduleForTest(
      TaskPlanScheduleKind.OneTime,
      params.startDate ?? Date.now(),
      anAllDayTiming(),
      null,
      TASK_TEST_TIME_CONTEXT,
    ),
  });
}

function createRecurringPlanForTest(params: {
  identityId: IdentityId;
  title: string;
  description?: string;
  importance?: ImportanceLevel;
  startDate?: number;
  timing: TaskTiming;
  recurrence: TaskRecurrence;
}) {
  return TaskPlan.create({
    identityId: params.identityId,
    title: params.title,
    description: params.description,
    importance: params.importance,
    schedule: canonicalTaskPlanScheduleForTest(
      TaskPlanScheduleKind.Recurring,
      params.startDate ?? Date.now(),
      params.timing,
      params.recurrence,
      TASK_TEST_TIME_CONTEXT,
    ),
  });
}

describe('TaskPlanPrismaRepository integration', () => {
  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanTaskTables();
  });

  it('persists and loads a one-time task plan by id', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskPlanPrismaRepository(prisma);

    // Create a one-time task plan
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const plan = createOneTimePlanForTest({
      identityId,
      title: 'Complete Project',
      description: 'Finish the quarterly project',
      importance: ImportanceLevel.Important,
      startDate: tomorrow.getTime(),
    });

    await repository.save(plan);

    const saved = await repository.findByIdForIdentity(identityId, plan.id);

    expect(saved).not.toBeNull();
    expect(saved?.id).toBe(plan.id);
    expect(saved?.identityId).toBe(identityId);
    expect(saved?.title).toBe('Complete Project');
    expect(saved?.schedule.kind).toBe(TaskPlanScheduleKind.OneTime);
  });

  it('persists and loads a recurring task plan by id', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskPlanPrismaRepository(prisma);

    const startDate = Date.now();

    // Create a recurring task plan
    const plan = createRecurringPlanForTest({
      identityId,
      title: 'Weekly Review',
      description: 'Review the week',
      importance: ImportanceLevel.Moderate,
      startDate,
      timing: aTimePointTiming(9 * 60),
      recurrence: aWeeklyRecurrence([0]),
    });

    await repository.save(plan);

    const saved = await repository.findByIdForIdentity(identityId, plan.id);

    expect(saved).not.toBeNull();
    expect(saved?.id).toBe(plan.id);
    expect(saved?.schedule.kind).toBe(TaskPlanScheduleKind.Recurring);
    expect(saved?.schedule.recurrence).toBeDefined();
  });

  it('lists plans by identity', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskPlanPrismaRepository(prisma);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const template1 = createOneTimePlanForTest({
      identityId,
      title: 'Task 1',
      importance: ImportanceLevel.Important,
      startDate: tomorrow.getTime(),
    });

    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 2);

    const template2 = createOneTimePlanForTest({
      identityId,
      title: 'Task 2',
      importance: ImportanceLevel.Minor,
      startDate: nextDay.getTime(),
    });

    await repository.save(template1);
    await repository.save(template2);

    const plans = await repository.findByIdentityId(identityId);

    expect(plans).toHaveLength(2);
    expect(plans.map((t) => t.id)).toContain(template1.id);
    expect(plans.map((t) => t.id)).toContain(template2.id);
  });

  it('preserves task importance levels', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskPlanPrismaRepository(prisma);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const plan = createOneTimePlanForTest({
      identityId,
      title: 'Important Task',
      description: 'A high-importance task',
      importance: ImportanceLevel.Important,
      startDate: tomorrow.getTime(),
    });

    await repository.save(plan);
    const saved = await repository.findByIdForIdentity(identityId, plan.id);

    expect(saved?.importance).toBe(ImportanceLevel.Important);
    expect(saved?.title).toBe('Important Task');
  });

  it('updates existing plan', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskPlanPrismaRepository(prisma);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const plan = createOneTimePlanForTest({
      identityId,
      title: 'Original Title',
      importance: ImportanceLevel.Minor,
      startDate: tomorrow.getTime(),
    });

    await repository.save(plan);

    // Update the plan
    plan.updateTitle('Updated Title');
    // R2-5a 乐观锁契约：变更后由调用方递增版本。
    plan.advanceVersion();

    await repository.save(plan);

    const saved = await repository.findByIdForIdentity(identityId, plan.id);

    expect(saved?.title).toBe('Updated Title');
  });

  it('handles soft deletion', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskPlanPrismaRepository(prisma);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const plan = createOneTimePlanForTest({
      identityId,
      title: 'To Delete',
      importance: ImportanceLevel.Moderate,
      startDate: tomorrow.getTime(),
    });

    await repository.save(plan);

    // Soft delete
    plan.softDelete();
    await repository.save(plan);

    const saved = await repository.findByIdForIdentity(identityId, plan.id);

    expect(saved?.deletedAt).not.toBeNull();
  });

  it('handles task type persistence correctly', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskPlanPrismaRepository(prisma);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const plan = createOneTimePlanForTest({
      identityId,
      title: 'One-time Task',
      importance: ImportanceLevel.Moderate,
      startDate: tomorrow.getTime(),
    });

    await repository.save(plan);
    const saved = await repository.findByIdForIdentity(identityId, plan.id);

    expect(saved?.schedule.kind).toBe(TaskPlanScheduleKind.OneTime);
    expect(saved?.schedule.recurrence).toBeNull();
  });

  it('round-trip: domain -> persistence -> domain preserves data integrity', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new TaskPlanPrismaRepository(prisma);

    const startDate = Date.now();

    const original = createRecurringPlanForTest({
      identityId,
      title: 'Complex Recurring Task',
      description: 'A detailed recurring task',
      importance: ImportanceLevel.Moderate,
      startDate,
      timing: aTimePointTiming(9 * 60),
      recurrence: aDailyRecurrence(2),
    });

    await repository.save(original);
    const loaded = await repository.findByIdForIdentity(String(original.identityId), original.id);

    expect(loaded).toBeDefined();
    expect(loaded?.title).toBe(original.title);
    expect(loaded?.description).toBe(original.description);
    expect(loaded?.schedule.kind).toBe(original.schedule.kind);
    expect(loaded?.importance).toBe(original.importance);
  });

  it('persists shared Task labels, hydrates labels[] and filters with strict AND + identity isolation', async () => {
    const identityId = IdentityId.generate();
    const otherIdentityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedAccount({ id: otherIdentityId });
    const prisma = await getPrisma();
    const repository = new TaskPlanPrismaRepository(prisma);
    const first = createOneTimePlanForTest({
      identityId,
      title: 'Work and AI',
      importance: ImportanceLevel.Important,
      startDate: Date.now() + 86400000,
    });
    const second = createOneTimePlanForTest({
      identityId,
      title: 'Work only',
      importance: ImportanceLevel.Moderate,
      startDate: Date.now() + 2 * 86400000,
    });
    await repository.save(first);
    await repository.save(second);

    const work = await prisma.label.create({
      data: {
        id: `task-label-work-${Date.now()}`,
        identityId,
        name: '#Work',
        normalizedName: '#work',
      },
    });
    const ai = await prisma.label.create({
      data: { id: `task-label-ai-${Date.now()}`, identityId, name: '#AI', normalizedName: '#ai' },
    });
    const foreign = await prisma.label.create({
      data: {
        id: `task-label-foreign-${Date.now()}`,
        identityId: otherIdentityId,
        name: '#Foreign',
        normalizedName: '#foreign',
      },
    });

    await repository.replaceLabels(identityId, String(first.id), [work.id, ai.id]);
    await repository.replaceLabels(identityId, String(second.id), [work.id]);

    const loaded = await repository.findByIdForIdentity(identityId, String(first.id));
    expect(loaded?.labels.map((label) => label.id).sort()).toEqual([ai.id, work.id].sort());
    const both = await repository.findByLabelIdsAll(identityId, [work.id, ai.id]);
    expect(both.map((plan) => String(plan.id))).toEqual([String(first.id)]);
    expect(both[0]?.labels.map((label) => label.id).sort()).toEqual([ai.id, work.id].sort());
    await expect(
      repository.replaceLabels(identityId, String(first.id), [foreign.id]),
    ).rejects.toBeInstanceOf(TaskLabelOwnershipError);
  });
});
