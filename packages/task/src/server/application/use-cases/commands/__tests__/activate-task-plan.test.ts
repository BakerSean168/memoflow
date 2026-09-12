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

const mockGenerateInstances = vi.fn().mockReturnValue([]);
vi.mock('../../../../domain/services', () => {
  return {
    TaskOccurrenceGenerationService: class {
      generateInstances = mockGenerateInstances;
      shouldRefillInstances = vi.fn().mockReturnValue(false);
      calculateRefillTargetDate = vi.fn().mockReturnValue(Date.now());
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
    mockGenerateInstances.mockReturnValue([]);

    templateRepo = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    });
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByTemplateId: vi.fn().mockResolvedValue([]),
      saveMany: vi.fn().mockResolvedValue(undefined),
    });

    useCase = new ActivateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        templateRepository: templateRepo,
        instanceRepository: instanceRepo,
      }),
      userTimeContextPort,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an error if transactionRunner is missing', () => {
    expect(
      () => new ActivateTaskPlanUseCase(templateRepo, instanceRepo, undefined as any),
    ).toThrow('TaskWriteTransactionRunner must be explicitly provided to ActivateTaskPlanUseCase');
  });

  it('should return NOT_FOUND when template does not exist', async () => {
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should activate a paused template', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    expect(template.status).toBe(TaskPlanStatus.Active);
    expect(templateRepo.save).toHaveBeenCalledWith(template);
  });

  it('should return BAD_REQUEST when template cannot be activated from its current state', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Active });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeErrorWithCode('BAD_REQUEST');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should save template at least once after activating', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    await useCase.execute(template.id, template.identityId);

    expect(templateRepo.save).toHaveBeenCalled();
  });

  it('should generate instances after activation', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    await useCase.execute(template.id, template.identityId);

    expect(mockGenerateInstances).toHaveBeenCalledWith(
      template,
      TASK_TEST_TIME_CONTEXT,
      {
        forceGenerate: true,
        fromDate: expect.any(Number),
      },
    );
  });

  it('should save generated instances when there are some', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const fakeInstances = [{}, {}, {}];
    mockGenerateInstances.mockReturnValue(fakeInstances);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    expect(instanceRepo.saveMany).toHaveBeenCalledWith(fakeInstances);
    if (result.ok) {
      expect(result.data.instancesGenerated).toBe(3);
    }
  });

  it('should not save instances when none are generated', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    mockGenerateInstances.mockReturnValue([]);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    expect(instanceRepo.saveMany).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.data.instancesGenerated).toBe(0);
    }
  });

  it('should return instancesGenerated count', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    mockGenerateInstances.mockReturnValue([{}, {}, {}, {}, {}]);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.instancesGenerated).toBe(5);
    }
  });

  it('should return the template client DTO', async () => {
    const template = aLoadedTaskPlan({
      status: TaskPlanStatus.Paused,
      title: 'Reactivated Task',
    });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.template).toBeDefined();
      expect(result.data.template.name).toBe('Reactivated Task');
    }
  });

  it('should return INTERNAL_ERROR when template persistence fails', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    mockGenerateInstances.mockReturnValue([{}, {}]);
    vi.mocked(templateRepo.save).mockRejectedValueOnce(new Error('save failed'));

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeErrorWithCode('INTERNAL_ERROR');
  });
});
