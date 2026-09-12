import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import {
  aOneTimeTask,
  aLoadedTaskPlan,
  aTaskOccurrence,
  aTimePointConfig,
  TASK_TEST_TIME_CONTEXT,
} from '../../../../../testing';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { UpdateTaskPlanUseCase } from '../update-task-plan.use-case';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskGoalBindingTrigger, TaskType } from '@memoflow/contracts/task';
import { RecurrenceRule } from '../../../../domain/value-objects/recurrence-rule';
import { TaskPlanSchedule } from '../../../../domain/value-objects/task-plan-schedule';
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
      findByTemplateId: vi.fn().mockResolvedValue([]),
      saveMany: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new UpdateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        templateRepository: templateRepo,
        instanceRepository: instanceRepo,
      }),
      userTimeContextPort,
    );
  });

  it('throws an error if transactionRunner is missing', () => {
    expect(() => new UpdateTaskPlanUseCase(templateRepo, instanceRepo, undefined as any)).toThrow(
      'TaskWriteTransactionRunner must be explicitly provided to UpdateTaskPlanUseCase',
    );
  });

  it('should return NOT_FOUND when template does not exist', async () => {
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1', { name: 'New Name' });

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should return CONFLICT when expectedVersion does not match current version (R2-5a)', async () => {
    const template = aOneTimeTask({ title: 'Old Name' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId, {
      name: 'New Name',
      expectedVersion: template.version + 1,
    });

    expect(result).toBeErrorWithCode('CONFLICT');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should accept expectedVersion matching current version and bump version on save (R2-5a)', async () => {
    const template = aOneTimeTask({ title: 'Old Name' });
    const versionBefore = template.version;
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId, {
      name: 'New Name',
      expectedVersion: versionBefore,
    });

    expect(result).toBeOk();
    expect(template.version).toBe(versionBefore + 1);
    expect(templateRepo.save).toHaveBeenCalledWith(template);
  });

  it('should bump version on save even when expectedVersion is omitted (backward compat)', async () => {
    const template = aOneTimeTask({ title: 'Old Name' });
    const versionBefore = template.version;
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    await useCase.execute(template.id, template.identityId, { name: 'New Name' });

    expect(template.version).toBe(versionBefore + 1);
  });

  it('should update the title when name is provided', async () => {
    const template = aOneTimeTask({ title: 'Old Name' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId, { name: 'New Name' });

    expect(result).toBeOk();
    expect(template.title).toBe('New Name');
    expect(templateRepo.save).toHaveBeenCalledWith(template);
  });

  it('should update the description', async () => {
    const template = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId, {
      description: 'Updated description',
    });

    expect(result).toBeOk();
    expect(template.description).toBe('Updated description');
  });

  it('should clear the description when null is passed', async () => {
    const template = aLoadedTaskPlan({ description: 'Some description' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId, {
      description: null as any,
    });

    expect(result).toBeOk();
    expect(template.description).toBeNull();
  });

  it('should update importance', async () => {
    const template = aOneTimeTask({ importance: ImportanceLevel.Moderate });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId, {
      importance: ImportanceLevel.Vital,
    });

    expect(result).toBeOk();
    expect(template.importance).toBe(ImportanceLevel.Vital);
  });

  it('should update multiple fields at once', async () => {
    const template = aOneTimeTask({ title: 'Old', importance: ImportanceLevel.Minor });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId, {
      name: 'New Name',
      importance: ImportanceLevel.Vital,
    });

    expect(result).toBeOk();
    expect(template.title).toBe('New Name');
    expect(template.importance).toBe(ImportanceLevel.Vital);
  });

  it('should not modify fields that are not in the request', async () => {
    const template = aOneTimeTask({
      title: 'Keep Me',
      importance: ImportanceLevel.Important,
    });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId, {
      description: 'Only this field changes',
    });

    expect(result).toBeOk();
    expect(template.title).toBe('Keep Me');
    expect(template.importance).toBe(ImportanceLevel.Important);
    expect(template.description).toBe('Only this field changes');
  });

  it('should save exactly once', async () => {
    const template = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    await useCase.execute(template.id, template.identityId, {
      name: 'A',
      description: 'B',
      importance: ImportanceLevel.Vital,
    });

    expect(templateRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should return the updated client DTO', async () => {
    const template = aOneTimeTask({ title: 'Before' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId, { name: 'After' });

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.name).toBe('After');
    }
  });

  it('should treat clearing a missing goal binding as a no-op', async () => {
    const template = aOneTimeTask({ title: 'No Goal Binding' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId, { goalBinding: null });

    expect(result).toBeOk();
    expect(template.goalBinding).toBeNull();
    expect(templateRepo.save).toHaveBeenCalledWith(template);
  });

  it('rejects whole-plan progress when updating an unlimited recurring task', async () => {
    const template = aLoadedTaskPlan({
      taskType: TaskType.Recurring,
      recurrenceRule: RecurrenceRule.createDaily(),
    });
    template.bindToGoal('goal-1', 'kr-1', {
      value: 1,
      trigger: TaskGoalBindingTrigger.EachCompletion,
    });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId, {
      goalBinding: {
        goalId: 'goal-1',
        keyResultId: 'kr-1',
        contribution: { value: 1, trigger: TaskGoalBindingTrigger.PlanCompletion },
      },
    });

    expect(result).toBeErrorWithCode('BAD_REQUEST');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('propagates importance only to Pending instances strictly after the effective time', async () => {
    const effectiveFrom = Date.UTC(2026, 6, 30, 12);
    const template = aOneTimeTask({ importance: ImportanceLevel.Moderate });
    const pastPending = await aTaskOccurrence({
      templateId: template.id,
      identityId: template.identityId,
      instanceDate: effectiveFrom - 1,
      importance: ImportanceLevel.Moderate,
    });
    const futurePending = await aTaskOccurrence({
      templateId: template.id,
      identityId: template.identityId,
      instanceDate: effectiveFrom + 1,
      importance: ImportanceLevel.Moderate,
    });
    const boundaryPending = await aTaskOccurrence({
      templateId: template.id,
      identityId: template.identityId,
      instanceDate: effectiveFrom,
      importance: ImportanceLevel.Moderate,
    });
    const futureInProgress = await aTaskOccurrence({
      templateId: template.id,
      identityId: template.identityId,
      instanceDate: effectiveFrom + 2,
      importance: ImportanceLevel.Moderate,
    });
    futureInProgress.start();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    vi.mocked(instanceRepo.findByTemplateId).mockResolvedValue([
      pastPending,
      boundaryPending,
      futurePending,
      futureInProgress,
    ]);
    useCase = new UpdateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        templateRepository: templateRepo,
        instanceRepository: instanceRepo,
      }),
      userTimeContextPort,
      () => effectiveFrom,
    );

    const result = await useCase.execute(template.id, template.identityId, {
      importance: ImportanceLevel.Vital,
    });

    expect(result).toBeOk();
    expect(pastPending.importance).toBe(ImportanceLevel.Moderate);
    expect(boundaryPending.importance).toBe(ImportanceLevel.Moderate);
    expect(futurePending.importance).toBe(ImportanceLevel.Vital);
    expect(futureInProgress.importance).toBe(ImportanceLevel.Moderate);
    expect(instanceRepo.saveMany).toHaveBeenCalledWith([futurePending]);
    expect(instanceRepo.deleteMany).not.toHaveBeenCalled();
  });

  it('does not rebuild Pending instances when a full form sends unchanged schedule values', async () => {
    const effectiveFrom = Date.UTC(2026, 6, 30, 12);
    const timeConfig = aTimePointConfig(540, new Date(effectiveFrom - 86400000));
    const recurrenceRule = RecurrenceRule.createDaily();
    const template = aLoadedTaskPlan({
      taskType: TaskType.Recurring,
      timeConfig,
      recurrenceRule,
      lastGeneratedDate: effectiveFrom + 3 * 86400000,
    });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    useCase = new UpdateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        templateRepository: templateRepo,
        instanceRepository: instanceRepo,
      }),
      userTimeContextPort,
      () => effectiveFrom,
    );

    const result = await useCase.execute(template.id, template.identityId, {
      name: 'Only the title changed',
      timeConfig: timeConfig.toDTO(),
      recurrenceRule: recurrenceRule.toDTO(),
      importance: template.importance,
    });

    expect(result).toBeOk();
    expect(instanceRepo.deleteMany).not.toHaveBeenCalled();
    expect(instanceRepo.saveMany).not.toHaveBeenCalled();
  });

  it('rebuilds future Pending instances for schedule changes without replacing InProgress dates', async () => {
    const day = 86400000;
    const effectiveFrom = Date.UTC(2026, 6, 30, 12);
    const oldTimeConfig = aTimePointConfig(540, new Date(effectiveFrom - day));
    const template = aLoadedTaskPlan({
      taskType: TaskType.Recurring,
      timeConfig: oldTimeConfig,
      recurrenceRule: RecurrenceRule.createDaily(),
      lastGeneratedDate: effectiveFrom + 3 * day,
      importance: ImportanceLevel.Moderate,
    });
    const futurePending = await aTaskOccurrence({
      templateId: template.id,
      identityId: template.identityId,
      instanceDate: effectiveFrom + day,
      timeConfig: oldTimeConfig,
    });
    const futureInProgress = await aTaskOccurrence({
      templateId: template.id,
      identityId: template.identityId,
      instanceDate: effectiveFrom + 2 * day,
      timeConfig: oldTimeConfig,
    });
    futureInProgress.start();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    vi.mocked(instanceRepo.findByTemplateId).mockResolvedValue([futurePending, futureInProgress]);
    useCase = new UpdateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        templateRepository: templateRepo,
        instanceRepository: instanceRepo,
      }),
      userTimeContextPort,
      () => effectiveFrom,
    );
    const newTimeConfig = aTimePointConfig(600, new Date(effectiveFrom - day));

    const result = await useCase.execute(template.id, template.identityId, {
      schedule: TaskPlanSchedule.fromLegacy(
        TaskType.Recurring,
        newTimeConfig,
        RecurrenceRule.createDaily(),
        TASK_TEST_TIME_CONTEXT,
      ).toDTO(),
    });

    expect(result).toBeOk();
    expect(instanceRepo.deleteMany).toHaveBeenCalledWith(template.identityId, [futurePending.id]);
    const generated = vi.mocked(instanceRepo.saveMany).mock.calls[0]?.[0] ?? [];
    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((instance) => instance.status === 'Pending')).toBe(true);
    expect(generated.every((instance) => instance.timeConfig.timePoint === 600)).toBe(true);
    expect(
      generated.some((instance) => instance.instanceDate === futureInProgress.instanceDate),
    ).toBe(false);
    expect(futureInProgress.timeConfig.timePoint).toBe(540);
  });

  it('does not expand the generation horizon when no future Pending instance exists', async () => {
    const day = 86400000;
    const effectiveFrom = Date.UTC(2026, 6, 30, 12);
    const oldTimeConfig = aTimePointConfig(540, new Date(effectiveFrom - day));
    const template = aLoadedTaskPlan({
      taskType: TaskType.Recurring,
      timeConfig: oldTimeConfig,
      recurrenceRule: RecurrenceRule.createDaily(),
      lastGeneratedDate: effectiveFrom - 1,
    });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    vi.mocked(instanceRepo.findByTemplateId).mockResolvedValue([]);
    useCase = new UpdateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        templateRepository: templateRepo,
        instanceRepository: instanceRepo,
      }),
      userTimeContextPort,
      () => effectiveFrom,
    );

    const result = await useCase.execute(template.id, template.identityId, {
      schedule: TaskPlanSchedule.fromLegacy(
        TaskType.Recurring,
        aTimePointConfig(600, new Date(effectiveFrom - day)),
        RecurrenceRule.createDaily(),
        TASK_TEST_TIME_CONTEXT,
      ).toDTO(),
    });

    expect(result).toBeOk();
    expect(instanceRepo.deleteMany).not.toHaveBeenCalled();
    expect(instanceRepo.saveMany).not.toHaveBeenCalled();
    expect(template.schedule.toLegacyTimeConfig(TASK_TEST_TIME_CONTEXT).timePoint).toBe(600);
  });

  it('runs template and instance writes through the provided transaction boundary', async () => {
    const template = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    const transactionRunner: TaskWriteTransactionRunner = {
      run: vi.fn((work) =>
        work({ templateRepository: templateRepo, instanceRepository: instanceRepo }),
      ),
    };
    useCase = new UpdateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      transactionRunner,
      userTimeContextPort,
    );

    const result = await useCase.execute(template.id, template.identityId, {
      name: 'Transactional',
    });

    expect(result).toBeOk();
    expect(transactionRunner.run).toHaveBeenCalledTimes(1);
  });

  it('replaces shared labels only when labelIds is present and returns the hydrated projection', async () => {
    const template = aOneTimeTask();
    const labels = [{ id: 'label-work', name: 'Work', color: null, createdAt: 1, updatedAt: 2 }];
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    vi.mocked(templateRepo.replaceLabels).mockResolvedValue(labels);

    const result = await useCase.execute(template.id, template.identityId, {
      labelIds: ['label-work'],
    });

    expect(result).toBeOk();
    expect(templateRepo.replaceLabels).toHaveBeenCalledWith(template.identityId, template.id, [
      'label-work',
    ]);
    expect(result.ok && result.data.labels).toEqual(labels);
  });
});
