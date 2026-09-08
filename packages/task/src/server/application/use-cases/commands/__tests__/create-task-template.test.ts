import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { anIdentityId } from '../../../../../testing';
import type { ITaskTemplateRepository } from '../../../../domain/repositories/i-task-template-repository';
import type { ITaskInstanceRepository } from '../../../../domain/repositories/i-task-instance-repository';
import type { CreateTaskTemplateUseCaseReq } from '@memoflow/contracts/task';
import { TaskGoalBindingTrigger, TaskType } from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { CreateTaskTemplateUseCase } from '../create-task-template.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';

vi.mock('@memoflow/utils', async () => {
  const actual = await vi.importActual<typeof import('@memoflow/utils')>('@memoflow/utils');
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      setLevel: vi.fn(),
      addTransport: vi.fn(),
      child: vi.fn(),
    })),
  };
});

const mockGenerateInstances = vi.fn().mockReturnValue([]);
vi.mock('../../../../domain/services', () => {
  return {
    TaskInstanceGenerationService: class {
      generateInstances = mockGenerateInstances;
      shouldRefillInstances = vi.fn().mockReturnValue(false);
      calculateRefillTargetDate = vi.fn().mockReturnValue(Date.now());
    },
  };
});

describe('CreateTaskTemplateUseCase', () => {
  let templateRepo: ReturnType<typeof createMockRepo<ITaskTemplateRepository>>;
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskInstanceRepository>>;
  let useCase: CreateTaskTemplateUseCase;

  function aCreateRequest(
    overrides: Partial<CreateTaskTemplateUseCaseReq> = {},
  ): CreateTaskTemplateUseCaseReq {
    return {
      identityId: anIdentityId(),
      name: 'Test Task',
      taskType: TaskType.OneTime,
      timeConfig: {
        timeType: 'AllDay',
        startDate: Date.now(),
        timePoint: null,
        timeRange: null,
      },
      importance: ImportanceLevel.Moderate,
      ...overrides,
    } as CreateTaskTemplateUseCaseReq;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGenerateInstances.mockReturnValue([]);

    templateRepo = createMockRepo<ITaskTemplateRepository>({
      save: vi.fn().mockResolvedValue(undefined),
    });
    instanceRepo = createMockRepo<ITaskInstanceRepository>({
      saveMany: vi.fn().mockResolvedValue(undefined),
    });

    const transactionRunner = createInlineTaskWriteTransactionRunner({
      templateRepository: templateRepo,
      instanceRepository: instanceRepo,
    });

    useCase = new CreateTaskTemplateUseCase(templateRepo, instanceRepo, transactionRunner);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an error if transactionRunner is missing', () => {
    expect(
      () => new CreateTaskTemplateUseCase(templateRepo, instanceRepo, undefined as any),
    ).toThrow(
      'TaskWriteTransactionRunner must be explicitly provided to CreateTaskTemplateUseCase',
    );
  });

  it('should create a one-time task template', async () => {
    const request = aCreateRequest({ name: 'Buy groceries', taskType: TaskType.OneTime });

    const result = await useCase.execute(request);

    expect(result).toBeOk();
    expect(templateRepo.save).toHaveBeenCalled();
    if (result.ok) {
      expect(result.data.template.name).toBe('Buy groceries');
    }
  });

  it('should save the template to the repository', async () => {
    const request = aCreateRequest();

    await useCase.execute(request);

    expect(templateRepo.save).toHaveBeenCalledTimes(1);
  });

  it('preserves a caller-supplied template ID and replays an existing template without new mutation', async () => {
    const templateId = 'ITaskTemplateId_550e8400-e29b-41d4-a716-446655440002';
    const request = aCreateRequest({ id: templateId as never });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);
    vi.mocked(instanceRepo.findByTemplateId).mockResolvedValue([]);

    const first = await useCase.execute(request);

    expect(first).toBeOk();
    expect(first.ok && first.data.template.id).toBe(templateId);
    const persisted = vi.mocked(templateRepo.save).mock.calls[0]?.[0];
    expect(persisted?.id).toBe(templateId);

    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(persisted ?? null);
    vi.mocked(instanceRepo.findByTemplateId).mockResolvedValue([]);
    vi.mocked(templateRepo.save).mockClear();
    vi.mocked(instanceRepo.saveMany).mockClear();
    mockGenerateInstances.mockClear();

    const replay = await useCase.execute(request);

    expect(replay).toBeOk();
    expect(replay.ok && replay.data.template.id).toBe(templateId);
    expect(templateRepo.save).not.toHaveBeenCalled();
    expect(instanceRepo.saveMany).not.toHaveBeenCalled();
    expect(mockGenerateInstances).not.toHaveBeenCalled();
  });

  it('should persist goal binding on the created template', async () => {
    const request = aCreateRequest({
      goalBinding: {
        goalId: 'goal-1',
        keyResultId: 'kr-1',
        contribution: { value: 2, trigger: TaskGoalBindingTrigger.PlanCompletion },
      },
    });

    await useCase.execute(request);

    expect(templateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        goalBinding: expect.objectContaining({
          goalId: 'goal-1',
          keyResultId: 'kr-1',
          contribution: { value: 2, trigger: TaskGoalBindingTrigger.PlanCompletion },
        }),
      }),
    );
  });

  it('should create a recurring task template', async () => {
    const request = aCreateRequest({
      name: 'Daily standup',
      taskType: TaskType.Recurring,
      recurrenceRule: {
        frequency: 'Daily',
        interval: 1,
        daysOfWeek: [],
        endDate: null,
        occurrences: null,
      },
    });

    const result = await useCase.execute(request);

    expect(result).toBeOk();
  });

  it('rejects whole-plan progress for an unlimited recurring task', async () => {
    const request = aCreateRequest({
      taskType: TaskType.Recurring,
      recurrenceRule: {
        frequency: 'Daily',
        interval: 1,
        daysOfWeek: [],
        endDate: null,
        occurrences: null,
      },
      goalBinding: {
        goalId: 'goal-1',
        keyResultId: 'kr-1',
        contribution: { value: 2, trigger: TaskGoalBindingTrigger.PlanCompletion },
      },
    });

    const result = await useCase.execute(request);

    expect(result).toBeErrorWithCode('BAD_REQUEST');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should use provided description', async () => {
    const request = aCreateRequest({
      name: 'Task with desc',
      description: 'A detailed description',
    });

    const result = await useCase.execute(request);

    expect(result).toBeOk();
  });

  it('should use provided importance level', async () => {
    const request = aCreateRequest({
      importance: ImportanceLevel.Vital,
    });

    const result = await useCase.execute(request);

    expect(result).toBeOk();
  });

  describe('instance generation for Active templates', () => {
    it('should generate instances when template is Active', async () => {
      const fakeInstances = [{}, {}, {}];
      mockGenerateInstances.mockReturnValue(fakeInstances);
      const request = aCreateRequest({
        taskType: TaskType.Recurring,
        recurrenceRule: {
          frequency: 'Daily',
          interval: 1,
          daysOfWeek: [],
          endDate: null,
          occurrences: null,
        },
      });

      const result = await useCase.execute(request);

      expect(result).toBeOk();
      if (result.ok) {
        expect(result.data.instanceCount).toBe(3);
        expect(result.data.todayInstanceCreated).toBe(false);
      }
    });

    it('reports when initial generation includes a today instance', async () => {
      mockGenerateInstances.mockReturnValue([{ instanceDate: Date.now() }]);

      const result = await useCase.execute(aCreateRequest());

      expect(result).toBeOk();
      if (result.ok) {
        expect(result.data.instanceCount).toBe(1);
        expect(result.data.todayInstanceCreated).toBe(true);
      }
    });

    it('should save generated instances', async () => {
      const fakeInstances = [{}, {}];
      mockGenerateInstances.mockReturnValue(fakeInstances);
      const request = aCreateRequest();

      await useCase.execute(request);

      expect(instanceRepo.saveMany).toHaveBeenCalledWith(fakeInstances);
    });

    it('should return instanceCount=0 when no instances generated', async () => {
      mockGenerateInstances.mockReturnValue([]);
      const request = aCreateRequest();

      const result = await useCase.execute(request);

      expect(result).toBeOk();
      if (result.ok) {
        expect(result.data.instanceCount).toBe(0);
        expect(result.data.todayInstanceCreated).toBe(false);
      }
    });

    it('should save generated instances when instances are generated', async () => {
      const fakeInstances = [{}, {}, {}, {}, {}];
      mockGenerateInstances.mockReturnValue(fakeInstances);
      const request = aCreateRequest();

      await useCase.execute(request);

      expect(instanceRepo.saveMany).toHaveBeenCalledWith(fakeInstances);
    });

    it('should not save instances when no instances are generated', async () => {
      mockGenerateInstances.mockReturnValue([]);
      const request = aCreateRequest();

      await useCase.execute(request);

      expect(instanceRepo.saveMany).not.toHaveBeenCalled();
    });

    it('should return INTERNAL_ERROR when instance generation fails', async () => {
      mockGenerateInstances.mockImplementation(() => {
        throw new Error('Generation failed');
      });
      const request = aCreateRequest();

      const result = await useCase.execute(request);

      expect(result).toBeErrorWithCode('INTERNAL_ERROR');
    });

    it('should return INTERNAL_ERROR when persisting generated instances fails', async () => {
      const fakeInstances = [{}, {}];
      mockGenerateInstances.mockReturnValue(fakeInstances);
      vi.mocked(instanceRepo.saveMany).mockRejectedValue(new Error('DB error'));
      const request = aCreateRequest();

      const result = await useCase.execute(request);

      expect(result).toBeErrorWithCode('INTERNAL_ERROR');
    });
  });

  it('should return the template client DTO', async () => {
    const request = aCreateRequest({ name: 'My New Task' });

    const result = await useCase.execute(request);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.template).toBeDefined();
      expect(result.data.template.name).toBe('My New Task');
      expect(result.data.template.id).toBeDefined();
    }
  });

  it('assigns shared labels in the same write boundary and returns the hydrated projection', async () => {
    const labels = [
      { id: 'label-work', name: 'Work', color: null, createdAt: 1, updatedAt: 2 },
      { id: 'label-ai', name: 'AI', color: '#123456', createdAt: 3, updatedAt: 4 },
    ];
    vi.mocked(templateRepo.replaceLabels).mockResolvedValue(labels);
    const request = aCreateRequest({ labelIds: ['label-work', 'label-ai'] });

    const result = await useCase.execute(request);

    expect(result).toBeOk();
    const persisted = vi.mocked(templateRepo.save).mock.calls[0]?.[0];
    expect(templateRepo.replaceLabels).toHaveBeenCalledWith(
      request.identityId,
      String(persisted?.id),
      ['label-work', 'label-ai'],
    );
    expect(result.ok && result.data.template.labels).toEqual(labels);
  });
});
