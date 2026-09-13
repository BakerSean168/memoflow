import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { aOneTimeTask } from '../../../../../testing';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { DeleteTaskPlanUseCase } from '../delete-task-plan.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';

describe('DeleteTaskPlanUseCase', () => {
  let templateRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: DeleteTaskPlanUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    templateRepo = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      deleteByPlanId: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new DeleteTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        planRepository: templateRepo,
        occurrenceRepository: instanceRepo,
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an error if transactionRunner is missing', () => {
    expect(
      () => new DeleteTaskPlanUseCase(templateRepo, instanceRepo, undefined as any),
    ).toThrow('TaskWriteTransactionRunner must be explicitly provided to DeleteTaskPlanUseCase');
  });

  it('should return ok(void) when plan not found (idempotent)', async () => {
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeOk();
    expect(templateRepo.delete).not.toHaveBeenCalled();
    expect(templateRepo.save).not.toHaveBeenCalled();
    expect(instanceRepo.deleteByPlanId).not.toHaveBeenCalled();
  });

  it('should hard-delete when soft=false (default)', async () => {
    const plan = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    expect(templateRepo.save).toHaveBeenCalledWith(plan);
    expect(instanceRepo.deleteByPlanId).toHaveBeenCalledWith(plan.id, plan.identityId);
    expect(templateRepo.delete).toHaveBeenCalledWith(plan.identityId, plan.id);
  });

  it('should soft-delete when soft=true', async () => {
    const plan = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId, true);

    expect(result).toBeOk();
    expect(templateRepo.save).toHaveBeenCalledWith(plan);
    expect(instanceRepo.deleteByPlanId).toHaveBeenCalledWith(plan.id, plan.identityId);
    expect(templateRepo.delete).not.toHaveBeenCalled();
  });

  it('should return ok(void) after delete', async () => {
    const plan = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
  });

  it('should return INTERNAL_ERROR when deleting generated occurrences fails', async () => {
    const plan = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(instanceRepo.deleteByPlanId).mockRejectedValue(new Error('delete occurrences failed'));

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeErrorWithCode('INTERNAL_ERROR');
  });

  it('should return INTERNAL_ERROR when hard delete fails after soft-deleting the plan', async () => {
    const plan = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(templateRepo.delete).mockRejectedValue(new Error('hard delete failed'));

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeErrorWithCode('INTERNAL_ERROR');
  });
});
