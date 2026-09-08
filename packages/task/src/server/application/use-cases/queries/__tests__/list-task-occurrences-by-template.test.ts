import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { aTaskOccurrence, aTaskPlanId, aOneTimeTask } from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import { ListTaskOccurrencesByTemplateUseCase } from '../list-task-occurrences-by-template.use-case';

describe('ListTaskOccurrencesByTemplateUseCase', () => {
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let templateRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let useCase: ListTaskOccurrencesByTemplateUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByTemplateId: vi.fn().mockResolvedValue([]),
    });
    templateRepo = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn(),
    });
    useCase = new ListTaskOccurrencesByTemplateUseCase(instanceRepo, templateRepo);
  });

  it('should return empty array when template is not owned', async () => {
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('template-1', 'identity-1');

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
    expect(instanceRepo.findByTemplateId).not.toHaveBeenCalled();
  });

  it('should return empty array when no instances exist for template', async () => {
    const template = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
  });

  it('should return all instances for the template', async () => {
    const template = aOneTimeTask();
    const instance1 = await aTaskOccurrence({ templateId: template.id as any });
    const instance2 = await aTaskOccurrence({ templateId: template.id as any });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    vi.mocked(instanceRepo.findByTemplateId).mockResolvedValue([instance1, instance2]);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe(instance1.id);
      expect(result.data[1].id).toBe(instance2.id);
    }
  });

  it('should pass identity and templateId to ownership lookup', async () => {
    const template = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    await useCase.execute(template.id, template.identityId);

    expect(templateRepo.findByIdForIdentity).toHaveBeenCalledWith(template.identityId, template.id);
    expect(instanceRepo.findByTemplateId).toHaveBeenCalledWith(template.id, template.identityId);
  });
});
