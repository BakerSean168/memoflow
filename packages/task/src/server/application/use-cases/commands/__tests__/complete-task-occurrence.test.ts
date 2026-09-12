import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { TaskGoalBindingTrigger, TaskPlanOutcome } from '@memoflow/contracts/task';
import { aLoadedTaskPlan, aTaskOccurrence, TASK_TEST_OCCURRENCE_PROJECTION } from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import { CompleteTaskOccurrenceUseCase } from '../complete-task-occurrence.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';

describe('CompleteTaskOccurrenceUseCase', () => {
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let templateRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let useCase: CompleteTaskOccurrenceUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn(),
      findByTemplateId: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
    });
    templateRepo = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
    });
    useCase = new CompleteTaskOccurrenceUseCase(
      instanceRepo,
      templateRepo,
      createInlineTaskWriteTransactionRunner({
        instanceRepository: instanceRepo,
        templateRepository: templateRepo,
      }),
      TASK_TEST_OCCURRENCE_PROJECTION,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an error if transactionRunner is missing', () => {
    expect(
      () => new CompleteTaskOccurrenceUseCase(instanceRepo, templateRepo, undefined as any),
    ).toThrow('TaskWriteTransactionRunner must be explicitly provided to CompleteTaskOccurrenceUseCase');
  });

  it('should return NOT_FOUND when instance does not exist', async () => {
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(instanceRepo.save).not.toHaveBeenCalled();
  });

  it('allows a skipped waiver to be corrected by a later Completed fact', async () => {
    const instance = await aTaskOccurrence();
    instance.skip('not applicable');
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId);

    expect(result).toBeOk();
    expect(instance.status).toBe('Completed');
    expect(instanceRepo.save).toHaveBeenCalledWith(instance);
  });

  it('allows an explicitly Missed occurrence to be corrected by late completion', async () => {
    const instance = await aTaskOccurrence();
    instance.markMissed('forgot yesterday');
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId);

    expect(result).toBeOk();
    expect(instance.status).toBe('Completed');
    expect(instanceRepo.save).toHaveBeenCalledWith(instance);
  });

  it('treats an already completed instance as an idempotent success', async () => {
    const instance = await aTaskOccurrence();
    instance.complete();
    const completeSpy = vi.spyOn(instance, 'complete');
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.instance.id).toBe(instance.id);
      expect(result.data.instance.status).toBe('Completed');
    }
    expect(completeSpy).not.toHaveBeenCalled();
    expect(templateRepo.findByIdForIdentity).not.toHaveBeenCalled();
    expect(instanceRepo.save).not.toHaveBeenCalled();
  });

  it('should complete a Pending instance', async () => {
    const instance = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId);

    expect(result).toBeOk();
    expect(instance.status).toBe('Completed');
    expect(instanceRepo.save).toHaveBeenCalledWith(instance);
  });

  it('should complete an InProgress instance', async () => {
    const instance = await aTaskOccurrence();
    instance.start();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId);

    expect(result).toBeOk();
    expect(instance.status).toBe('Completed');
  });

  it('should pass duration, note, and rating to complete()', async () => {
    const instance = await aTaskOccurrence();
    const completeSpy = vi.spyOn(instance, 'complete');
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    await useCase.execute(instance.id, instance.identityId, {
      duration: 45,
      note: 'Great work',
      rating: 5,
    });

    expect(completeSpy).toHaveBeenCalledWith(45, 'Great work', 5, {
      taskTitle: '',
      goalBinding: null,
    });
  });

  it('includes the task goal binding in the completion event context', async () => {
    const template = aLoadedTaskPlan({ title: 'Ship linked task' });
    template.bindToGoal('goal-1', 'kr-1', { value: 2, trigger: TaskGoalBindingTrigger.EachCompletion });
    const instance = await aTaskOccurrence({ templateId: template.id });
    const completeSpy = vi.spyOn(instance, 'complete');
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    await useCase.execute(instance.id, instance.identityId);

    expect(completeSpy).toHaveBeenCalledWith(undefined, undefined, undefined, {
      taskTitle: 'Ship linked task',
      goalBinding: template.goalBinding?.toDTO(),
    });
  });

  it('publishes the authoritative Succeeded transition after the final completion', async () => {
    const template = aLoadedTaskPlan({ title: 'Finish recurring work' });
    template.bindToGoal('goal-1', 'kr-1', { value: 3, trigger: TaskGoalBindingTrigger.PlanCompletion });
    const instance = await aTaskOccurrence({ templateId: template.id, instanceDate: 200 });
    const completedSibling = await aTaskOccurrence({ templateId: template.id, instanceDate: 100 });
    completedSibling.complete();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);
    vi.mocked(instanceRepo.findByTemplateId).mockResolvedValue([completedSibling, instance]);
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    await useCase.execute(instance.id, instance.identityId);

    expect(template.outcome).toBe(TaskPlanOutcome.Succeeded);
    expect(template.domainEvents).toContainEqual(
      expect.objectContaining({
        eventType: 'task:plan-outcome-changed',
        payload: expect.objectContaining({
          triggeringTaskOccurrenceId: instance.id,
          previousOutcome: TaskPlanOutcome.Open,
          nextOutcome: TaskPlanOutcome.Succeeded,
        }),
      }),
    );
  });

  it('keeps the plan Open while a future sibling is still pending', async () => {
    const template = aLoadedTaskPlan({ title: 'Finish the complete plan' });
    template.bindToGoal('goal-1', 'kr-1', { value: 3, trigger: TaskGoalBindingTrigger.PlanCompletion });
    const instance = await aTaskOccurrence({ templateId: template.id, instanceDate: 200 });
    const completedSibling = await aTaskOccurrence({ templateId: template.id, instanceDate: 100 });
    const futurePendingSibling = await aTaskOccurrence({
      templateId: template.id,
      instanceDate: 300,
    });
    completedSibling.complete();
    const completeSpy = vi.spyOn(instance, 'complete');
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);
    vi.mocked(instanceRepo.findByTemplateId).mockResolvedValue([
      completedSibling,
      instance,
      futurePendingSibling,
    ]);
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    await useCase.execute(instance.id, instance.identityId);

    expect(completeSpy).toHaveBeenCalledWith(undefined, undefined, undefined, {
      taskTitle: 'Finish the complete plan',
      goalBinding: template.goalBinding?.toDTO(),
    });
    expect(template.outcome).toBe(TaskPlanOutcome.Open);
    expect(template.domainEvents.filter((event) => event.eventType === 'task:plan-outcome-changed')).toHaveLength(0);
  });

  it('should return the instance client DTO in the response', async () => {
    const instance = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.instance).toBeDefined();
      expect(result.data.instance.id).toBe(instance.id);
    }
  });
});
