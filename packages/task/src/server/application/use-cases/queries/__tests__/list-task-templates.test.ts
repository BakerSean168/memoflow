import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import {
  aOneTimeTask,
  aLoadedTaskTemplate,
  aRecurringTask,
  anIdentityId,
} from '../../../../../testing';
import type { ITaskTemplateRepository } from '../../../../domain/repositories/i-task-template-repository';
import type { ITaskInstanceRepository } from '../../../../domain/repositories/i-task-instance-repository';
import { TaskTemplateStatus } from '@memoflow/contracts/task';
import { ListTaskTemplatesUseCase } from '../list-task-templates.use-case';

// Mock eventBus — preserve all real exports
vi.mock('@memoflow/utils', async () => {
  const actual = await vi.importActual<typeof import('@memoflow/utils')>('@memoflow/utils');
  return {
    ...actual,
    eventBus: { send: vi.fn() },
  };
});

// Mock TaskInstanceGenerationService
const mockShouldRefill = vi.fn().mockReturnValue(false);
const mockGenerateInstances = vi.fn().mockReturnValue([]);
vi.mock('../../../../domain/services', () => {
  return {
    TaskInstanceGenerationService: class {
      shouldRefillInstances = mockShouldRefill;
      generateInstances = mockGenerateInstances;
      calculateRefillTargetDate = vi.fn().mockReturnValue(Date.now());
    },
  };
});

describe('ListTaskTemplatesUseCase', () => {
  let templateRepo: ReturnType<typeof createMockRepo<ITaskTemplateRepository>>;
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskInstanceRepository>>;
  let useCase: ListTaskTemplatesUseCase;
  const testIdentityId = anIdentityId();

  beforeEach(() => {
    vi.clearAllMocks();
    mockShouldRefill.mockReturnValue(false);
    mockGenerateInstances.mockReturnValue([]);

    templateRepo = createMockRepo<ITaskTemplateRepository>({
      findByIdentityId: vi.fn().mockResolvedValue([]),
      findByStatus: vi.fn().mockResolvedValue([]),
      findByGoalId: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
    });
    instanceRepo = createMockRepo<ITaskInstanceRepository>({
      saveMany: vi.fn().mockResolvedValue(undefined),
    });

    useCase = new ListTaskTemplatesUseCase(templateRepo, instanceRepo);
  });

  describe('filtering', () => {
    it('should filter by status when status is provided', async () => {
      const template = aLoadedTaskTemplate({ status: TaskTemplateStatus.Active });
      vi.mocked(templateRepo.findByStatus).mockResolvedValue([template]);

      const result = await useCase.execute({
        identityId: testIdentityId,
        status: [TaskTemplateStatus.Active],
      });

      expect(result).toBeOk();
      expect(templateRepo.findByStatus).toHaveBeenCalledWith(
        testIdentityId,
        TaskTemplateStatus.Active,
      );
      if (result.ok) {
        expect(result.data.templates).toHaveLength(1);
        expect(result.data.total).toBe(1);
      }
    });

    it('should filter by goalId when provided (and no status)', async () => {
      await useCase.execute({
        identityId: testIdentityId,
        goalId: 'goal-1' as any,
      });

      expect(templateRepo.findByGoalId).toHaveBeenCalledWith(testIdentityId, 'goal-1');
    });

    it('should fallback to findByIdentityId when no filters provided', async () => {
      await useCase.execute({
        identityId: testIdentityId,
      });

      expect(templateRepo.findByIdentityId).toHaveBeenCalledWith(testIdentityId);
    });

    it('delegates shared Label AND filtering to the repository', async () => {
      const template = aOneTimeTask({ title: 'Work + AI' });
      vi.mocked(templateRepo.findByLabelIdsAll).mockResolvedValue([template]);

      const result = await useCase.execute({
        identityId: testIdentityId,
        labelIdsAll: ['label-work', 'label-ai'],
      });

      expect(result).toBeOk();
      expect(templateRepo.findByLabelIdsAll).toHaveBeenCalledWith(testIdentityId, [
        'label-work',
        'label-ai',
      ]);
      expect(result.ok && result.data.templates.map((item) => item.name)).toEqual(['Work + AI']);
    });
  });

  it('should return empty list when no templates found', async () => {
    const result = await useCase.execute({ identityId: testIdentityId });

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.templates).toEqual([]);
      expect(result.data.total).toBe(0);
    }
  });

  it('should return template client DTOs', async () => {
    const template1 = aOneTimeTask({ title: 'Task A' });
    const template2 = aOneTimeTask({ title: 'Task B' });
    vi.mocked(templateRepo.findByIdentityId).mockResolvedValue([template1, template2]);

    const result = await useCase.execute({ identityId: testIdentityId });

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.templates).toHaveLength(2);
      expect(result.data.templates[0].name).toBe('Task A');
      expect(result.data.templates[1].name).toBe('Task B');
      expect(result.data.total).toBe(2);
    }
  });
});
