import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { aLoadedTaskPlan, TASK_TEST_TIME_CONTEXT } from '../../../../../testing';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { TaskPlanStatus } from '@memoflow/contracts/task';
import { ActivateTaskPlanUseCase } from '../activate-task-plan.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';

const userTimeContextPort = {
  getUserTimeContext: vi.fn().mockResolvedValue(TASK_TEST_TIME_CONTEXT),
};

const mockGenerateOccurrences = vi.fn().mockReturnValue([]);
vi.mock('../../../../domain/services', () => {
  return {
    TaskOccurrenceGenerationService: class {
      generateOccurrences = mockGenerateOccurrences;
    },
  };
});

describe('ActivateTaskPlanUseCase', () => {
  let templateRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: ActivateTaskPlanUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGenerateOccurrences.mockReturnValue([]);

    templateRepo = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    });
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByPlanId: vi.fn().mockResolvedValue([]),
      saveMany: vi.fn().mockResolvedValue(undefined),
    });

    useCase = new ActivateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        planRepository: templateRepo,
        occurrenceRepository: instanceRepo,
      }),
      userTimeContextPort,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an error if transactionRunner is missing', () => {
    expect(() => new ActivateTaskPlanUseCase(templateRepo, instanceRepo, undefined as any)).toThrow(
      'TaskWriteTransactionRunner must be explicitly provided to ActivateTaskPlanUseCase',
    );
  });

  it('should return NOT_FOUND when plan does not exist', async () => {
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should activate a paused plan', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    expect(plan.status).toBe(TaskPlanStatus.Active);
    expect(templateRepo.save).toHaveBeenCalledWith(plan);
  });

  it('should return BAD_REQUEST when plan cannot be activated from its current state', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Active });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeErrorWithCode('BAD_REQUEST');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should save plan at least once after activating', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    await useCase.execute(plan.id, plan.identityId);

    expect(templateRepo.save).toHaveBeenCalled();
  });

  it('should generate occurrences after activation', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    await useCase.execute(plan.id, plan.identityId);

    expect(mockGenerateOccurrences).toHaveBeenCalledWith(plan, TASK_TEST_TIME_CONTEXT, {
      fromDate: expect.any(Number),
      existingOccurrences: [],
    });
  });

  it('should save generated occurrences when there are some', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const fakeInstances = [{}, {}, {}];
    mockGenerateOccurrences.mockReturnValue(fakeInstances);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    expect(instanceRepo.saveMany).toHaveBeenCalledWith(fakeInstances);
    if (result.ok) {
      expect(result.data.occurrencesGenerated).toBe(3);
    }
  });

  it('should not save occurrences when none are generated', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    mockGenerateOccurrences.mockReturnValue([]);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    expect(instanceRepo.saveMany).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.data.occurrencesGenerated).toBe(0);
    }
  });

  it('should return occurrencesGenerated count', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    mockGenerateOccurrences.mockReturnValue([{}, {}, {}, {}, {}]);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.occurrencesGenerated).toBe(5);
    }
  });

  it('should return the plan client DTO', async () => {
    const plan = aLoadedTaskPlan({
      status: TaskPlanStatus.Paused,
      title: 'Reactivated Task',
    });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.plan).toBeDefined();
      expect(result.data.plan.name).toBe('Reactivated Task');
    }
  });

  it('should return INTERNAL_ERROR when plan persistence fails', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    mockGenerateOccurrences.mockReturnValue([{}, {}]);
    vi.mocked(templateRepo.save).mockRejectedValueOnce(new Error('save failed'));

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeErrorWithCode('INTERNAL_ERROR');
  });
});
