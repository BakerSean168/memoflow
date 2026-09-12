import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import {
  aLoadedTaskPlan,
  TASK_TEST_OCCURRENCE_PROJECTION,
  TASK_TEST_TIME_CONTEXT,
} from '../../../../../testing';
import { TaskPlanStatus } from '@memoflow/contracts/task';
import { InvalidTaskPlanStateError } from '../../../../domain/value-objects/task-errors';
import { GenerateTaskOccurrencesUseCase } from '../generate-task-occurrences.use-case';
import { MarkTaskOccurrenceMissedUseCase } from '../mark-task-occurrence-missed.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';

const userTimeContextPort = {
  getUserTimeContext: vi.fn().mockResolvedValue(TASK_TEST_TIME_CONTEXT),
};

const mockGenerateInstances = vi.fn();
vi.mock('../../../../domain/services', () => {
  return {
    TaskOccurrenceGenerationService: class {
      generateInstances = mockGenerateInstances;
    },
  };
});

describe('Instance maintenance use-cases', () => {
  let templateRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;

  const createGenerateUseCase = () =>
    new GenerateTaskOccurrencesUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        templateRepository: templateRepo,
        instanceRepository: instanceRepo,
      }),
      userTimeContextPort,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    templateRepo = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    });

    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdentityId: vi.fn().mockResolvedValue([]),
      findByTemplateId: vi.fn().mockResolvedValue([]),
      saveMany: vi.fn().mockResolvedValue(undefined),
    });
  });

  describe('MarkTaskOccurrenceMissedUseCase', () => {
    it('persists Missed only after an explicit command', async () => {
      const instance = {
        canMarkMissed: vi.fn().mockReturnValue(true),
        markMissed: vi.fn(),
        toClientDTOAt: vi.fn().mockReturnValue({ id: 'i-1', status: 'Missed' }),
      } as any;
      vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);
      vi.mocked(instanceRepo.save).mockResolvedValue(undefined);

      const result = await new MarkTaskOccurrenceMissedUseCase(
        instanceRepo,
        createInlineTaskWriteTransactionRunner({ instanceRepository: instanceRepo }),
        TASK_TEST_OCCURRENCE_PROJECTION,
      ).execute(
        'i-1',
        'identity-1',
        { reason: 'No completion evidence' },
      );

      expect(instance.markMissed).toHaveBeenCalledWith('No completion evidence');
      expect(instanceRepo.save).toHaveBeenCalledWith(instance);
      expect(result).toBeOkWith({ instance: { id: 'i-1', status: 'Missed' } } as any);
    });
  });

  describe('GenerateTaskOccurrencesUseCase', () => {
    it('throws an error if transactionRunner is missing', () => {
      expect(
        () => new GenerateTaskOccurrencesUseCase(templateRepo, instanceRepo, undefined as any),
      ).toThrow('TaskWriteTransactionRunner must be explicitly provided to GenerateTaskOccurrencesUseCase');
    });

    it('returns NOT_FOUND when template does not exist', async () => {
      vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);
      const useCase = createGenerateUseCase();

      const result = await useCase.execute('tpl-404', 'identity-1', {
        fromDate: 0,
        toDate: Date.now(),
      });

      expect(result).toBeErrorWithCode('NOT_FOUND');
      expect(mockGenerateInstances).not.toHaveBeenCalled();
      expect(instanceRepo.saveMany).not.toHaveBeenCalled();
      expect(templateRepo.save).not.toHaveBeenCalled();
    });

    it('returns empty list without persisting when generator yields none', async () => {
      const template = { id: 'tpl-1' } as any;
      vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
      mockGenerateInstances.mockReturnValue([]);
      const useCase = createGenerateUseCase();

      const result = await useCase.execute('tpl-1', 'identity-1', {
        fromDate: 1,
        toDate: 2,
      });

      expect(result).toBeOkWith([] as any);
      expect(mockGenerateInstances).toHaveBeenCalledWith(
        template,
        TASK_TEST_TIME_CONTEXT,
        {
          forceGenerate: true,
        targetDate: 2,
          fromDate: 1,
        },
      );
      expect(instanceRepo.saveMany).not.toHaveBeenCalled();
      expect(templateRepo.save).not.toHaveBeenCalled();
    });

    it('persists generated instances and returns DTO list', async () => {
      const template = { id: 'tpl-1' } as any;
      const generated = [
        { toClientDTOAt: vi.fn().mockReturnValue({ id: 'i-1' }) },
        { toClientDTOAt: vi.fn().mockReturnValue({ id: 'i-2' }) },
      ];
      vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
      mockGenerateInstances.mockReturnValue(generated as any);
      const useCase = createGenerateUseCase();

      const result = await useCase.execute('tpl-1', 'identity-1', {
        fromDate: 10,
        toDate: 20,
      });

      expect(result).toBeOkWith([{ id: 'i-1' }, { id: 'i-2' }] as any);
      expect(instanceRepo.saveMany).toHaveBeenCalledWith(generated);
      expect(templateRepo.save).toHaveBeenCalledWith(template);
    });

    it('returns BAD_REQUEST when the template cannot generate instances in its current state', async () => {
      const template = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
      vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
      mockGenerateInstances.mockImplementation(() => {
        throw new InvalidTaskPlanStateError('Can only generate instances for active templates');
      });
      const useCase = createGenerateUseCase();

      const result = await useCase.execute(template.id, template.identityId, {
        fromDate: 10,
        toDate: 20,
      });

      expect(result).toBeErrorWithCode('BAD_REQUEST');
      expect(instanceRepo.saveMany).not.toHaveBeenCalled();
    });

    it('returns INTERNAL_ERROR when template persistence fails after generating instances', async () => {
      const template = aLoadedTaskPlan();
      const generated = [{ toClientDTOAt: vi.fn().mockReturnValue({ id: 'i-1' }) }];
      vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
      mockGenerateInstances.mockReturnValue(generated as any);
      vi.mocked(templateRepo.save).mockRejectedValue(new Error('save failed'));
      const useCase = createGenerateUseCase();

      const result = await useCase.execute(template.id, template.identityId, {
        fromDate: 10,
        toDate: 20,
      });

      expect(result).toBeErrorWithCode('INTERNAL_ERROR');
    });
  });
});
