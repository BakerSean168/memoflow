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
      findByPlanId: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
    });
    templateRepo = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
    });
    useCase = new CompleteTaskOccurrenceUseCase(
      instanceRepo,
      templateRepo,
      createInlineTaskWriteTransactionRunner({
        occurrenceRepository: instanceRepo,
        planRepository: templateRepo,
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

  it('should return NOT_FOUND when occurrence does not exist', async () => {
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(instanceRepo.save).not.toHaveBeenCalled();
  });

  it('allows a skipped waiver to be corrected by a later Completed fact', async () => {
    const occurrence = await aTaskOccurrence();
    occurrence.skip('not applicable');
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(occurrence.id, occurrence.identityId);

    expect(result).toBeOk();
    expect(occurrence.status).toBe('Completed');
    expect(instanceRepo.save).toHaveBeenCalledWith(occurrence);
  });

  it('allows an explicitly Missed occurrence to be corrected by late completion', async () => {
    const occurrence = await aTaskOccurrence();
    occurrence.markMissed('forgot yesterday');
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(occurrence.id, occurrence.identityId);

    expect(result).toBeOk();
    expect(occurrence.status).toBe('Completed');
    expect(instanceRepo.save).toHaveBeenCalledWith(occurrence);
  });

  it('treats an already completed occurrence as an idempotent success', async () => {
    const occurrence = await aTaskOccurrence();
    occurrence.complete();
    const completeSpy = vi.spyOn(occurrence, 'complete');
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(occurrence.id, occurrence.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.occurrence.id).toBe(occurrence.id);
      expect(result.data.occurrence.status).toBe('Completed');
    }
    expect(completeSpy).not.toHaveBeenCalled();
    expect(templateRepo.findByIdForIdentity).not.toHaveBeenCalled();
    expect(instanceRepo.save).not.toHaveBeenCalled();
  });

  it('should complete a Pending occurrence', async () => {
    const occurrence = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(occurrence.id, occurrence.identityId);

    expect(result).toBeOk();
    expect(occurrence.status).toBe('Completed');
    expect(instanceRepo.save).toHaveBeenCalledWith(occurrence);
  });

  it('should complete an InProgress occurrence', async () => {
    const occurrence = await aTaskOccurrence();
    occurrence.start();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(occurrence.id, occurrence.identityId);

    expect(result).toBeOk();
    expect(occurrence.status).toBe('Completed');
  });

  it('should pass duration, note, and rating to complete()', async () => {
    const occurrence = await aTaskOccurrence();
    const completeSpy = vi.spyOn(occurrence, 'complete');
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);

    await useCase.execute(occurrence.id, occurrence.identityId, {
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
    const plan = aLoadedTaskPlan({ title: 'Ship linked task' });
    plan.bindToGoal('goal-1', 'kr-1', { value: 2, trigger: TaskGoalBindingTrigger.EachCompletion });
    const occurrence = await aTaskOccurrence({ planId: plan.id });
    const completeSpy = vi.spyOn(occurrence, 'complete');
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    await useCase.execute(occurrence.id, occurrence.identityId);

    expect(completeSpy).toHaveBeenCalledWith(undefined, undefined, undefined, {
      taskTitle: 'Ship linked task',
      goalBinding: plan.goalBinding?.toDTO(),
    });
  });

  it('publishes the authoritative Succeeded transition after the final completion', async () => {
    const plan = aLoadedTaskPlan({ title: 'Finish recurring work' });
    plan.bindToGoal('goal-1', 'kr-1', { value: 3, trigger: TaskGoalBindingTrigger.PlanCompletion });
    const occurrence = await aTaskOccurrence({ planId: plan.id, occurrenceDate: 200 });
    const completedSibling = await aTaskOccurrence({ planId: plan.id, occurrenceDate: 100 });
    completedSibling.complete();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);
    vi.mocked(instanceRepo.findByPlanId).mockResolvedValue([completedSibling, occurrence]);
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    await useCase.execute(occurrence.id, occurrence.identityId);

    expect(plan.outcome).toBe(TaskPlanOutcome.Succeeded);
    expect(plan.domainEvents).toContainEqual(
      expect.objectContaining({
        eventType: 'task:plan-outcome-changed',
        payload: expect.objectContaining({
          triggeringTaskOccurrenceId: occurrence.id,
          previousOutcome: TaskPlanOutcome.Open,
          nextOutcome: TaskPlanOutcome.Succeeded,
        }),
      }),
    );
  });

  it('keeps the plan Open while a future sibling is still pending', async () => {
    const plan = aLoadedTaskPlan({ title: 'Finish the complete plan' });
    plan.bindToGoal('goal-1', 'kr-1', { value: 3, trigger: TaskGoalBindingTrigger.PlanCompletion });
    const occurrence = await aTaskOccurrence({ planId: plan.id, occurrenceDate: 200 });
    const completedSibling = await aTaskOccurrence({ planId: plan.id, occurrenceDate: 100 });
    const futurePendingSibling = await aTaskOccurrence({
      planId: plan.id,
      occurrenceDate: 300,
    });
    completedSibling.complete();
    const completeSpy = vi.spyOn(occurrence, 'complete');
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);
    vi.mocked(instanceRepo.findByPlanId).mockResolvedValue([
      completedSibling,
      occurrence,
      futurePendingSibling,
    ]);
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    await useCase.execute(occurrence.id, occurrence.identityId);

    expect(completeSpy).toHaveBeenCalledWith(undefined, undefined, undefined, {
      taskTitle: 'Finish the complete plan',
      goalBinding: plan.goalBinding?.toDTO(),
    });
    expect(plan.outcome).toBe(TaskPlanOutcome.Open);
    expect(plan.domainEvents.filter((event) => event.eventType === 'task:plan-outcome-changed')).toHaveLength(0);
  });

  it('should return the occurrence client DTO in the response', async () => {
    const occurrence = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(occurrence.id, occurrence.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.occurrence).toBeDefined();
      expect(result.data.occurrence.id).toBe(occurrence.id);
    }
  });
});
