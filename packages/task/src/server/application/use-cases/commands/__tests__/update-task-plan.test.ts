import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import {
  aOneTimeTask,
  aLoadedTaskPlan,
  aTaskOccurrence,
  aDailyRecurrence,
  aTimePointTiming,
  canonicalTaskPlanScheduleForTest,
  TASK_TEST_TIME_CONTEXT,
} from '../../../../../testing';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { UpdateTaskPlanUseCase } from '../update-task-plan.use-case';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskGoalBindingTrigger, TaskPlanScheduleKind, TaskTimingKind } from '@memoflow/contracts/task';
import {
  createInlineTaskWriteTransactionRunner,
  type TaskWriteTransactionRunner,
} from '../task-write-support';

const userTimeContextPort = {
  getUserTimeContext: vi.fn().mockResolvedValue(TASK_TEST_TIME_CONTEXT),
};

describe('UpdateTaskPlanUseCase', () => {
  let templateRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: UpdateTaskPlanUseCase;

  beforeEach(() => {
    templateRepo = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    });
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByPlanId: vi.fn().mockResolvedValue([]),
      saveMany: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new UpdateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        planRepository: templateRepo,
        occurrenceRepository: instanceRepo,
      }),
      userTimeContextPort,
    );
  });

  it('throws an error if transactionRunner is missing', () => {
    expect(() => new UpdateTaskPlanUseCase(templateRepo, instanceRepo, undefined as any)).toThrow(
      'TaskWriteTransactionRunner must be explicitly provided to UpdateTaskPlanUseCase',
    );
  });

  it('should return NOT_FOUND when plan does not exist', async () => {
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1', { name: 'New Name' });

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should return CONFLICT when expectedVersion does not match current version (R2-5a)', async () => {
    const plan = aOneTimeTask({ title: 'Old Name' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId, {
      name: 'New Name',
      expectedVersion: plan.version + 1,
    });

    expect(result).toBeErrorWithCode('CONFLICT');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should accept expectedVersion matching current version and bump version on save (R2-5a)', async () => {
    const plan = aOneTimeTask({ title: 'Old Name' });
    const versionBefore = plan.version;
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId, {
      name: 'New Name',
      expectedVersion: versionBefore,
    });

    expect(result).toBeOk();
    expect(plan.version).toBe(versionBefore + 1);
    expect(templateRepo.save).toHaveBeenCalledWith(plan);
  });

  it('should bump version on save even when expectedVersion is omitted (backward compat)', async () => {
    const plan = aOneTimeTask({ title: 'Old Name' });
    const versionBefore = plan.version;
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    await useCase.execute(plan.id, plan.identityId, { name: 'New Name' });

    expect(plan.version).toBe(versionBefore + 1);
  });

  it('should update the title when name is provided', async () => {
    const plan = aOneTimeTask({ title: 'Old Name' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId, { name: 'New Name' });

    expect(result).toBeOk();
    expect(plan.title).toBe('New Name');
    expect(templateRepo.save).toHaveBeenCalledWith(plan);
  });

  it('should update the description', async () => {
    const plan = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId, {
      description: 'Updated description',
    });

    expect(result).toBeOk();
    expect(plan.description).toBe('Updated description');
  });

  it('should clear the description when null is passed', async () => {
    const plan = aLoadedTaskPlan({ description: 'Some description' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId, {
      description: null as any,
    });

    expect(result).toBeOk();
    expect(plan.description).toBeNull();
  });

  it('should update importance', async () => {
    const plan = aOneTimeTask({ importance: ImportanceLevel.Moderate });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId, {
      importance: ImportanceLevel.Vital,
    });

    expect(result).toBeOk();
    expect(plan.importance).toBe(ImportanceLevel.Vital);
  });

  it('should update multiple fields at once', async () => {
    const plan = aOneTimeTask({ title: 'Old', importance: ImportanceLevel.Minor });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId, {
      name: 'New Name',
      importance: ImportanceLevel.Vital,
    });

    expect(result).toBeOk();
    expect(plan.title).toBe('New Name');
    expect(plan.importance).toBe(ImportanceLevel.Vital);
  });

  it('should not modify fields that are not in the request', async () => {
    const plan = aOneTimeTask({
      title: 'Keep Me',
      importance: ImportanceLevel.Important,
    });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId, {
      description: 'Only this field changes',
    });

    expect(result).toBeOk();
    expect(plan.title).toBe('Keep Me');
    expect(plan.importance).toBe(ImportanceLevel.Important);
    expect(plan.description).toBe('Only this field changes');
  });

  it('should save exactly once', async () => {
    const plan = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    await useCase.execute(plan.id, plan.identityId, {
      name: 'A',
      description: 'B',
      importance: ImportanceLevel.Vital,
    });

    expect(templateRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should return the updated client DTO', async () => {
    const plan = aOneTimeTask({ title: 'Before' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId, { name: 'After' });

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.name).toBe('After');
    }
  });

  it('should treat clearing a missing goal binding as a no-op', async () => {
    const plan = aOneTimeTask({ title: 'No Goal Binding' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId, { goalBinding: null });

    expect(result).toBeOk();
    expect(plan.goalBinding).toBeNull();
    expect(templateRepo.save).toHaveBeenCalledWith(plan);
  });

  it('rejects whole-plan progress when updating an unlimited recurring task', async () => {
    const plan = aLoadedTaskPlan({
      schedule: canonicalTaskPlanScheduleForTest(
        TaskPlanScheduleKind.Recurring,
        Date.now(),
        aTimePointTiming(),
        aDailyRecurrence(),
      ),
    });
    plan.bindToGoal('goal-1', 'kr-1', {
      value: 1,
      trigger: TaskGoalBindingTrigger.EachCompletion,
    });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId, {
      goalBinding: {
        goalId: 'goal-1',
        keyResultId: 'kr-1',
        contribution: { value: 1, trigger: TaskGoalBindingTrigger.PlanCompletion },
      },
    });

    expect(result).toBeErrorWithCode('BAD_REQUEST');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('propagates importance only to Pending occurrences strictly after the effective time', async () => {
    const effectiveFrom = Date.UTC(2026, 6, 30, 12);
    const plan = aOneTimeTask({ importance: ImportanceLevel.Moderate });
    const pastPending = await aTaskOccurrence({
      planId: plan.id,
      identityId: plan.identityId,
      occurrenceDate: effectiveFrom - 86_400_000,
      importance: ImportanceLevel.Moderate,
    });
    const futurePending = await aTaskOccurrence({
      planId: plan.id,
      identityId: plan.identityId,
      occurrenceDate: effectiveFrom + 86_400_000,
      importance: ImportanceLevel.Moderate,
    });
    const boundaryPending = await aTaskOccurrence({
      planId: plan.id,
      identityId: plan.identityId,
      occurrenceDate: effectiveFrom,
      importance: ImportanceLevel.Moderate,
    });
    const futureInProgress = await aTaskOccurrence({
      planId: plan.id,
      identityId: plan.identityId,
      occurrenceDate: effectiveFrom + 2 * 86_400_000,
      importance: ImportanceLevel.Moderate,
    });
    futureInProgress.start();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(instanceRepo.findByPlanId).mockResolvedValue([
      pastPending,
      boundaryPending,
      futurePending,
      futureInProgress,
    ]);
    useCase = new UpdateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        planRepository: templateRepo,
        occurrenceRepository: instanceRepo,
      }),
      userTimeContextPort,
      () => effectiveFrom,
    );

    const result = await useCase.execute(plan.id, plan.identityId, {
      importance: ImportanceLevel.Vital,
    });

    expect(result).toBeOk();
    expect(pastPending.importanceSnapshot).toBe(ImportanceLevel.Moderate);
    expect(boundaryPending.importanceSnapshot).toBe(ImportanceLevel.Moderate);
    expect(futurePending.importanceSnapshot).toBe(ImportanceLevel.Vital);
    expect(futureInProgress.importanceSnapshot).toBe(ImportanceLevel.Moderate);
    expect(instanceRepo.saveMany).toHaveBeenCalledWith([futurePending]);
    expect(instanceRepo.deleteMany).not.toHaveBeenCalled();
  });

  it('does not rebuild Pending occurrences when a full form sends unchanged schedule values', async () => {
    const effectiveFrom = Date.UTC(2026, 6, 30, 12);
    const timing = aTimePointTiming(540);
    const recurrence = aDailyRecurrence();
    const plan = aLoadedTaskPlan({
      schedule: canonicalTaskPlanScheduleForTest(TaskPlanScheduleKind.Recurring, effectiveFrom - 86400000, timing, recurrence),
    });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    useCase = new UpdateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        planRepository: templateRepo,
        occurrenceRepository: instanceRepo,
      }),
      userTimeContextPort,
      () => effectiveFrom,
    );

    const result = await useCase.execute(plan.id, plan.identityId, {
      name: 'Only the title changed',
      schedule: canonicalTaskPlanScheduleForTest(TaskPlanScheduleKind.Recurring, effectiveFrom - 86400000, timing, recurrence).toDTO(),
      importance: plan.importance,
    });

    expect(result).toBeOk();
    expect(instanceRepo.deleteMany).not.toHaveBeenCalled();
    expect(instanceRepo.saveMany).not.toHaveBeenCalled();
  });

  it('rebuilds future Pending occurrences for schedule changes without replacing InProgress dates', async () => {
    const day = 86400000;
    const effectiveFrom = Date.UTC(2026, 6, 30, 12);
    const oldTiming = aTimePointTiming(540);
    const plan = aLoadedTaskPlan({
      schedule: canonicalTaskPlanScheduleForTest(TaskPlanScheduleKind.Recurring, effectiveFrom - day, oldTiming, aDailyRecurrence()),
      importance: ImportanceLevel.Moderate,
    });
    const futurePending = await aTaskOccurrence({
      planId: plan.id,
      identityId: plan.identityId,
      occurrenceDate: effectiveFrom + day,
      timing: oldTiming,
    });
    const futureInProgress = await aTaskOccurrence({
      planId: plan.id,
      identityId: plan.identityId,
      occurrenceDate: effectiveFrom + 2 * day,
      timing: oldTiming,
    });
    futureInProgress.start();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(instanceRepo.findByPlanId).mockResolvedValue([futurePending, futureInProgress]);
    useCase = new UpdateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        planRepository: templateRepo,
        occurrenceRepository: instanceRepo,
      }),
      userTimeContextPort,
      () => effectiveFrom,
    );
    const newTiming = aTimePointTiming(600);

    const result = await useCase.execute(plan.id, plan.identityId, {
      schedule: canonicalTaskPlanScheduleForTest(
        TaskPlanScheduleKind.Recurring,
        effectiveFrom - day,
        newTiming,
        aDailyRecurrence(),
        TASK_TEST_TIME_CONTEXT,
      ).toDTO(),
    });

    expect(result).toBeOk();
    expect(instanceRepo.deleteMany).toHaveBeenCalledWith(plan.identityId, [futurePending.id]);
    const generated = vi.mocked(instanceRepo.saveMany).mock.calls[0]?.[0] ?? [];
    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((occurrence) => occurrence.status === 'Pending')).toBe(true);
    expect(
      generated.every(
        (occurrence) =>
          occurrence.scheduleSnapshot.timing.kind === 'At' &&
          occurrence.scheduleSnapshot.timing.time === '10:00',
      ),
    ).toBe(true);
    expect(
      generated.some((occurrence) => occurrence.scheduleDate === futureInProgress.scheduleDate),
    ).toBe(false);
    expect(futureInProgress.scheduleSnapshot.timing).toEqual({ kind: 'At', time: '09:00' });
  });

  it('does not synthesize a regeneration horizon when no future Pending fact exists', async () => {
    const day = 86400000;
    const effectiveFrom = Date.UTC(2026, 6, 30, 12);
    const oldTiming = aTimePointTiming(540);
    const plan = aLoadedTaskPlan({
      schedule: canonicalTaskPlanScheduleForTest(TaskPlanScheduleKind.Recurring, effectiveFrom - day, oldTiming, aDailyRecurrence()),
    });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(instanceRepo.findByPlanId).mockResolvedValue([]);
    useCase = new UpdateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        planRepository: templateRepo,
        occurrenceRepository: instanceRepo,
      }),
      userTimeContextPort,
      () => effectiveFrom,
    );

    const result = await useCase.execute(plan.id, plan.identityId, {
      schedule: canonicalTaskPlanScheduleForTest(
        TaskPlanScheduleKind.Recurring,
        effectiveFrom - day,
        aTimePointTiming(600),
        aDailyRecurrence(),
        TASK_TEST_TIME_CONTEXT,
      ).toDTO(),
    });

    expect(result).toBeOk();
    expect(instanceRepo.deleteMany).not.toHaveBeenCalled();
    expect(instanceRepo.saveMany).not.toHaveBeenCalled();
    expect(plan.schedule.timing).toEqual({ kind: TaskTimingKind.At, time: '10:00' });
  });

  it('runs plan and occurrence writes through the provided transaction boundary', async () => {
    const plan = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    const transactionRunner: TaskWriteTransactionRunner = {
      run: vi.fn((work) =>
        work({ planRepository: templateRepo, occurrenceRepository: instanceRepo }),
      ),
    };
    useCase = new UpdateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      transactionRunner,
      userTimeContextPort,
    );

    const result = await useCase.execute(plan.id, plan.identityId, {
      name: 'Transactional',
    });

    expect(result).toBeOk();
    expect(transactionRunner.run).toHaveBeenCalledTimes(1);
  });

  it('replaces shared labels only when labelIds is present and returns the hydrated projection', async () => {
    const plan = aOneTimeTask();
    const labels = [{ id: 'label-work', name: 'Work', color: null, createdAt: 1, updatedAt: 2 }];
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(templateRepo.replaceLabels).mockResolvedValue(labels);

    const result = await useCase.execute(plan.id, plan.identityId, {
      labelIds: ['label-work'],
    });

    expect(result).toBeOk();
    expect(templateRepo.replaceLabels).toHaveBeenCalledWith(plan.identityId, plan.id, [
      'label-work',
    ]);
    expect(result.ok && result.data.labels).toEqual(labels);
  });
});
