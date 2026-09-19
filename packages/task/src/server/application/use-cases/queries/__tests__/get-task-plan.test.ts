import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import {
  aOneTimeTask,
  aTaskOccurrence,
  TASK_TEST_TIME_CONTEXT,
  TASK_TEST_USER_TIME_CONTEXT_PORT,
} from '../../../../../testing';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { GetTaskPlanUseCase } from '../get-task-plan.use-case';
import { createTimeContext } from '@memoflow/time';

describe('GetTaskPlanUseCase', () => {
  let templateRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: GetTaskPlanUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    templateRepo = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn(),
    });
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByPlanId: vi.fn(),
    });
    vi.mocked(instanceRepo.findByPlanId).mockResolvedValue([]);
    useCase = new GetTaskPlanUseCase(templateRepo, instanceRepo, TASK_TEST_USER_TIME_CONTEXT_PORT);
  });

  it('should return null when plan does not exist', async () => {
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });

  it('should return the plan client DTO when found', async () => {
    const plan = aOneTimeTask({ title: 'My Task' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toBeDefined();
      expect(result.data!.name).toBe('My Task');
      expect(result.data!.id).toBe(plan.id);
    }
  });

  it('hydrates stats from occurrences without embedding occurrence children', async () => {
    const plan = aOneTimeTask({ title: 'My Task' });
    const pendingInstance = await aTaskOccurrence({ planId: plan.id as any });
    const completedInstance = await aTaskOccurrence({ planId: plan.id as any });
    completedInstance.complete();

    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(instanceRepo.findByPlanId).mockResolvedValue([
      pendingInstance,
      completedInstance,
    ]);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    if (result.ok && result.data) {
      expect(result.data.occurrenceCount).toBe(2);
      expect(result.data.completedOccurrenceCount).toBe(1);
      expect(result.data.completionRate).toBe(50);
      expect(result.data).not.toHaveProperty('occurrences');
    }
  });

  it('uses 30 Product Time calendar dates across spring-forward DST', async () => {
    const plan = aOneTimeTask({ title: 'DST Task' });
    const timeContext = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
    const userTimeContextPort = { getUserTimeContext: vi.fn().mockResolvedValue(timeContext) };
    const asOf = Date.parse('2026-03-09T03:30:00.000Z'); // Mar 8 23:30 local, after jump
    const dstUseCase = new GetTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      userTimeContextPort,
      () => asOf,
    );
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(instanceRepo.getPlanStats).mockResolvedValue({});

    await dstUseCase.execute(plan.id, plan.identityId);

    expect(instanceRepo.getPlanStats).toHaveBeenCalledWith([plan.id], plan.identityId, {
      windowStart: '2026-02-07',
      asOf: '2026-03-08',
    });
    expect(asOf - Date.parse('2026-02-07T05:00:00.000Z')).not.toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('uses findByIdForIdentity for the plan lookup', async () => {
    const plan = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    await useCase.execute(plan.id, plan.identityId);

    expect(templateRepo.findByIdForIdentity).toHaveBeenCalledWith(plan.identityId, plan.id);
  });

  it('uses occurrence fallback only for stats when aggregate stats are unavailable', async () => {
    const plan = aOneTimeTask();
    const occurrence = await aTaskOccurrence({ planId: plan.id as any });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(instanceRepo.findByPlanId).mockResolvedValue([occurrence]);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(templateRepo.findByIdForIdentity).toHaveBeenCalledWith(plan.identityId, plan.id);
    expect(instanceRepo.findByPlanId).toHaveBeenCalledWith(plan.id, plan.identityId);
    expect(result).toBeOk();
    if (result.ok && result.data) {
      expect(result.data.occurrenceCount).toBe(1);
      expect(result.data).not.toHaveProperty('occurrences');
    }
  });

  it('calls toClientDTO without plan history', async () => {
    const plan = aOneTimeTask();
    const spy = vi.spyOn(plan, 'toClientDTOAt');
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    await useCase.execute(plan.id, plan.identityId);

    expect(spy).toHaveBeenCalledWith(TASK_TEST_TIME_CONTEXT, false, expect.any(Number));
  });
});
