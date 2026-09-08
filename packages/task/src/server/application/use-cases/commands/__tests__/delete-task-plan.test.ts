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
      deleteByTemplateId: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new DeleteTaskPlanUseCase(
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
      () => new DeleteTaskPlanUseCase(templateRepo, instanceRepo, undefined as any),
    ).toThrow('TaskWriteTransactionRunner must be explicitly provided to DeleteTaskPlanUseCase');
  });

  it('should return ok(void) when template not found (idempotent)', async () => {
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeOk();
    expect(templateRepo.delete).not.toHaveBeenCalled();
    expect(templateRepo.save).not.toHaveBeenCalled();
    expect(instanceRepo.deleteByTemplateId).not.toHaveBeenCalled();
  });

  it('should hard-delete when soft=false (default)', async () => {
    const template = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    expect(templateRepo.save).toHaveBeenCalledWith(template);
    expect(instanceRepo.deleteByTemplateId).toHaveBeenCalledWith(template.id, template.identityId);
    expect(templateRepo.delete).toHaveBeenCalledWith(template.identityId, template.id);
  });

  it('should soft-delete when soft=true', async () => {
    const template = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId, true);

    expect(result).toBeOk();
    expect(templateRepo.save).toHaveBeenCalledWith(template);
    expect(instanceRepo.deleteByTemplateId).toHaveBeenCalledWith(template.id, template.identityId);
    expect(templateRepo.delete).not.toHaveBeenCalled();
  });

  it('should return ok(void) after delete', async () => {
    const template = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
  });

  it('should return INTERNAL_ERROR when deleting generated instances fails', async () => {
    const template = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    vi.mocked(instanceRepo.deleteByTemplateId).mockRejectedValue(new Error('delete instances failed'));

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeErrorWithCode('INTERNAL_ERROR');
  });

  it('should return INTERNAL_ERROR when hard delete fails after soft-deleting the template', async () => {
    const template = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    vi.mocked(templateRepo.delete).mockRejectedValue(new Error('hard delete failed'));

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeErrorWithCode('INTERNAL_ERROR');
  });
});
