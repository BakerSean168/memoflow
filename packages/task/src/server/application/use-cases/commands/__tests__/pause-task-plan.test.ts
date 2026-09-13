import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { aLoadedTaskPlan, TASK_TEST_USER_TIME_CONTEXT_PORT } from '../../../../../testing';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { TaskPlanStatus } from '@memoflow/contracts/task';
import { PauseTaskPlanUseCase } from '../pause-task-plan.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';

describe('PauseTaskPlanUseCase', () => {
  let templateRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: PauseTaskPlanUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    templateRepo = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    });
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      deleteIncompleteOccurrencesFrom: vi.fn().mockResolvedValue(0),
    });
    useCase = new PauseTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        planRepository: templateRepo,
        occurrenceRepository: instanceRepo,
      }),
      TASK_TEST_USER_TIME_CONTEXT_PORT,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an error if transactionRunner is missing', () => {
    expect(() => new PauseTaskPlanUseCase(templateRepo, instanceRepo, undefined as any)).toThrow(
      'TaskWriteTransactionRunner must be explicitly provided to PauseTaskPlanUseCase',
    );
  });

  it('should return NOT_FOUND when plan does not exist', async () => {
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should pause an active plan', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Active });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    expect(plan.status).toBe(TaskPlanStatus.Paused);
    expect(templateRepo.save).toHaveBeenCalledWith(plan);
  });

  it('should return BAD_REQUEST when plan is not active', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeErrorWithCode('BAD_REQUEST');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should delete incomplete occurrences when pausing', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Active });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(instanceRepo.deleteIncompleteOccurrencesFrom).mockResolvedValue(1);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    expect(instanceRepo.deleteIncompleteOccurrencesFrom).toHaveBeenCalledWith(
      plan.id,
      plan.identityId,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it('should include the deleted occurrence count', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Active });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(instanceRepo.deleteIncompleteOccurrencesFrom).mockResolvedValue(2);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.instancesDeleted).toBe(2);
    }
  });

  it('should return 0 deleted occurrences when there are none', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Active });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(instanceRepo.deleteIncompleteOccurrencesFrom).mockResolvedValue(0);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.instancesDeleted).toBe(0);
    }
  });

  it('should return the plan client DTO', async () => {
    const plan = aLoadedTaskPlan({
      status: TaskPlanStatus.Active,
      title: 'My Paused Task',
    });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.plan).toBeDefined();
      expect(result.data.plan.name).toBe('My Paused Task');
    }
  });

  it('should return INTERNAL_ERROR when deleting incomplete occurrences fails', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Active });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(instanceRepo.deleteIncompleteOccurrencesFrom).mockRejectedValue(new Error('DB error'));

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeErrorWithCode('INTERNAL_ERROR');
  });
});
