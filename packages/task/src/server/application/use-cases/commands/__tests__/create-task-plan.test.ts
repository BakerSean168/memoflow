import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { anIdentityId, TASK_TEST_TIME_CONTEXT } from '../../../../../testing';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import type { CreateTaskPlanUseCaseReq } from '@memoflow/contracts/task';
import { TaskGoalBindingTrigger } from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { CreateTaskPlanUseCase } from '../create-task-plan.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';
import { createTimeFacade } from '@memoflow/time';

const userTimeContextPort = {
  getUserTimeContext: vi.fn().mockResolvedValue(TASK_TEST_TIME_CONTEXT),
};

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

const mockGenerateOccurrences = vi.fn().mockReturnValue([]);
vi.mock('../../../../domain/services', () => {
  return {
    TaskOccurrenceGenerationService: class {
      generateOccurrences = mockGenerateOccurrences;
    },
  };
});

describe('CreateTaskPlanUseCase', () => {
  let templateRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: CreateTaskPlanUseCase;

  function oneTimeSchedule(): CreateTaskPlanUseCaseReq['schedule'] {
    return {
      kind: 'OneTime',
      date: '2026-09-08',
      timing: { kind: 'AllDay' },
    } as CreateTaskPlanUseCaseReq['schedule'];
  }

  function recurringSchedule(
    end: { kind: 'Never' } | { kind: 'Count'; count: number } = { kind: 'Never' },
  ): CreateTaskPlanUseCaseReq['schedule'] {
    return {
      kind: 'Recurring',
      startDate: '2026-09-08',
      timing: { kind: 'AllDay' },
      recurrence: { frequency: 'Daily', interval: 1, byWeekday: [], end },
    } as CreateTaskPlanUseCaseReq['schedule'];
  }

  function aCreateRequest(
    overrides: Partial<CreateTaskPlanUseCaseReq> = {},
  ): CreateTaskPlanUseCaseReq {
    return {
      identityId: anIdentityId(),
      name: 'Test Task',
      schedule: oneTimeSchedule(),
      importance: ImportanceLevel.Moderate,
      ...overrides,
    } as CreateTaskPlanUseCaseReq;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGenerateOccurrences.mockReturnValue([]);

    templateRepo = createMockRepo<ITaskPlanRepository>({
      save: vi.fn().mockResolvedValue(undefined),
    });
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      saveMany: vi.fn().mockResolvedValue(undefined),
    });

    const transactionRunner = createInlineTaskWriteTransactionRunner({
      planRepository: templateRepo,
      occurrenceRepository: instanceRepo,
    });

    useCase = new CreateTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      transactionRunner,
      userTimeContextPort,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an error if transactionRunner is missing', () => {
    expect(() => new CreateTaskPlanUseCase(templateRepo, instanceRepo, undefined as any)).toThrow(
      'TaskWriteTransactionRunner must be explicitly provided to CreateTaskPlanUseCase',
    );
  });

  it('should create a one-time task plan', async () => {
    const request = aCreateRequest({ name: 'Buy groceries' });

    const result = await useCase.execute(request);

    expect(result).toBeOk();
    expect(templateRepo.save).toHaveBeenCalled();
    if (result.ok) {
      expect(result.data.plan.name).toBe('Buy groceries');
    }
  });

  it('should save the plan to the repository', async () => {
    const request = aCreateRequest();

    await useCase.execute(request);

    expect(templateRepo.save).toHaveBeenCalledTimes(1);
  });

  it('preserves a caller-supplied plan ID and replays an existing plan without new mutation', async () => {
    const planId = 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440002';
    const request = aCreateRequest({ id: planId as never });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);
    vi.mocked(instanceRepo.findByPlanId).mockResolvedValue([]);

    const first = await useCase.execute(request);

    expect(first).toBeOk();
    expect(first.ok && first.data.plan.id).toBe(planId);
    const persisted = vi.mocked(templateRepo.save).mock.calls[0]?.[0];
    expect(persisted?.id).toBe(planId);

    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(persisted ?? null);
    vi.mocked(instanceRepo.findByPlanId).mockResolvedValue([]);
    vi.mocked(templateRepo.save).mockClear();
    vi.mocked(instanceRepo.saveMany).mockClear();
    mockGenerateOccurrences.mockClear();

    const replay = await useCase.execute(request);

    expect(replay).toBeOk();
    expect(replay.ok && replay.data.plan.id).toBe(planId);
    expect(templateRepo.save).not.toHaveBeenCalled();
    expect(instanceRepo.saveMany).not.toHaveBeenCalled();
    expect(mockGenerateOccurrences).not.toHaveBeenCalled();
  });

  it('should persist goal binding on the created plan', async () => {
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

  it('should create a recurring task plan', async () => {
    const request = aCreateRequest({
      name: 'Daily standup',
      schedule: recurringSchedule(),
    });

    const result = await useCase.execute(request);

    expect(result).toBeOk();
  });

  it('rejects whole-plan progress for an unlimited recurring task', async () => {
    const request = aCreateRequest({
      schedule: recurringSchedule(),
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

  describe('occurrence generation for Active plans', () => {
    it('should generate occurrences when plan is Active', async () => {
      const fakeInstances = [{}, {}, {}];
      mockGenerateOccurrences.mockReturnValue(fakeInstances);
      const request = aCreateRequest({
        schedule: recurringSchedule(),
      });

      const result = await useCase.execute(request);

      expect(result).toBeOk();
      if (result.ok) {
        expect(result.data.occurrenceCount).toBe(3);
        expect(result.data.todayOccurrenceCreated).toBe(false);
      }
    });

    it('reports when initial generation includes a today occurrence', async () => {
      mockGenerateOccurrences.mockReturnValue([
        {
          scheduleDate: createTimeFacade({ context: TASK_TEST_TIME_CONTEXT }).calendar.toYmd(
            Date.now(),
          ),
        },
      ]);

      const result = await useCase.execute(aCreateRequest());

      expect(result).toBeOk();
      if (result.ok) {
        expect(result.data.occurrenceCount).toBe(1);
        expect(result.data.todayOccurrenceCreated).toBe(true);
      }
    });

    it('should save generated occurrences', async () => {
      const fakeInstances = [{}, {}];
      mockGenerateOccurrences.mockReturnValue(fakeInstances);
      const request = aCreateRequest();

      await useCase.execute(request);

      expect(instanceRepo.saveMany).toHaveBeenCalledWith(fakeInstances);
    });

    it('should return occurrenceCount=0 when no occurrences generated', async () => {
      mockGenerateOccurrences.mockReturnValue([]);
      const request = aCreateRequest();

      const result = await useCase.execute(request);

      expect(result).toBeOk();
      if (result.ok) {
        expect(result.data.occurrenceCount).toBe(0);
        expect(result.data.todayOccurrenceCreated).toBe(false);
      }
    });

    it('should save generated occurrences when occurrences are generated', async () => {
      const fakeInstances = [{}, {}, {}, {}, {}];
      mockGenerateOccurrences.mockReturnValue(fakeInstances);
      const request = aCreateRequest();

      await useCase.execute(request);

      expect(instanceRepo.saveMany).toHaveBeenCalledWith(fakeInstances);
    });

    it('should not save occurrences when no occurrences are generated', async () => {
      mockGenerateOccurrences.mockReturnValue([]);
      const request = aCreateRequest();

      await useCase.execute(request);

      expect(instanceRepo.saveMany).not.toHaveBeenCalled();
    });

    it('should return INTERNAL_ERROR when occurrence generation fails', async () => {
      mockGenerateOccurrences.mockImplementation(() => {
        throw new Error('Generation failed');
      });
      const request = aCreateRequest();

      const result = await useCase.execute(request);

      expect(result).toBeErrorWithCode('INTERNAL_ERROR');
    });

    it('should return INTERNAL_ERROR when persisting generated occurrences fails', async () => {
      const fakeInstances = [{}, {}];
      mockGenerateOccurrences.mockReturnValue(fakeInstances);
      vi.mocked(instanceRepo.saveMany).mockRejectedValue(new Error('DB error'));
      const request = aCreateRequest();

      const result = await useCase.execute(request);

      expect(result).toBeErrorWithCode('INTERNAL_ERROR');
    });
  });

  it('should return the plan client DTO', async () => {
    const request = aCreateRequest({ name: 'My New Task' });

    const result = await useCase.execute(request);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.plan).toBeDefined();
      expect(result.data.plan.name).toBe('My New Task');
      expect(result.data.plan.id).toBeDefined();
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
    expect(result.ok && result.data.plan.labels).toEqual(labels);
  });
});
