import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { aLoadedTaskPlan } from '../../../../../testing';
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
      deleteIncompleteInstancesFrom: vi.fn().mockResolvedValue(0),
    });
    useCase = new PauseTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        templateRepository: templateRepo,
        instanceRepository: instanceRepo,
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an error if transactionRunner is missing', () => {
    expect(
      () => new PauseTaskPlanUseCase(templateRepo, instanceRepo, undefined as any),
    ).toThrow('TaskWriteTransactionRunner must be explicitly provided to PauseTaskPlanUseCase');
  });

  it('should return NOT_FOUND when template does not exist', async () => {
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should pause an active template', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Active });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    expect(template.status).toBe(TaskPlanStatus.Paused);
    expect(templateRepo.save).toHaveBeenCalledWith(template);
  });

  it('should return BAD_REQUEST when template is not active', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeErrorWithCode('BAD_REQUEST');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should delete incomplete instances when pausing', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Active });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    vi.mocked(instanceRepo.deleteIncompleteInstancesFrom).mockResolvedValue(1);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    expect(instanceRepo.deleteIncompleteInstancesFrom).toHaveBeenCalledWith(
      template.id,
      template.identityId,
      expect.any(Number),
    );
  });

  it('should include the deleted instance count', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Active });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    vi.mocked(instanceRepo.deleteIncompleteInstancesFrom).mockResolvedValue(2);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.instancesDeleted).toBe(2);
    }
  });

  it('should return 0 deleted instances when there are none', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Active });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    vi.mocked(instanceRepo.deleteIncompleteInstancesFrom).mockResolvedValue(0);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.instancesDeleted).toBe(0);
    }
  });

  it('should return the template client DTO', async () => {
    const template = aLoadedTaskPlan({
      status: TaskPlanStatus.Active,
      title: 'My Paused Task',
    });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.template).toBeDefined();
      expect(result.data.template.name).toBe('My Paused Task');
    }
  });

  it('should return INTERNAL_ERROR when deleting incomplete instances fails', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Active });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    vi.mocked(instanceRepo.deleteIncompleteInstancesFrom).mockRejectedValue(new Error('DB error'));

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeErrorWithCode('INTERNAL_ERROR');
  });
});
