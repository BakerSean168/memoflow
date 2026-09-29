import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import {
  aOneTimeTask,
  anIdentityId,
  TASK_TEST_USER_TIME_CONTEXT_PORT,
} from '../../../../../testing';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { ListTaskPlansUseCase } from '../list-task-plans.use-case';

describe('ListTaskPlansUseCase', () => {
  let planRepository: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let occurrenceRepository: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: ListTaskPlansUseCase;
  const identityId = anIdentityId();

  beforeEach(() => {
    vi.clearAllMocks();
    planRepository = createMockRepo<ITaskPlanRepository>({
      findPage: vi.fn().mockResolvedValue({ plans: [], total: 0 }),
    });
    occurrenceRepository = createMockRepo<ITaskOccurrenceRepository>({
      getPlanStats: vi.fn().mockResolvedValue({}),
    });

    useCase = new ListTaskPlansUseCase(
      planRepository,
      occurrenceRepository,
      TASK_TEST_USER_TIME_CONTEXT_PORT,
    );
  });

  it('uses a real bounded repository query with the default page contract', async () => {
    const result = await useCase.execute({ identityId });

    expect(result).toBeOk();
    expect(planRepository.findPage).toHaveBeenCalledWith(identityId, {
      limit: 20,
      offset: 0,
    });
    expect(occurrenceRepository.getPlanStats).not.toHaveBeenCalled();
  });

  it('forwards page, Goal/KR, status and Label scope into one server-side page query', async () => {
    const plan = aOneTimeTask({ title: 'Scoped task' });
    vi.mocked(planRepository.findPage).mockResolvedValue({ plans: [plan], total: 27 });

    const result = await useCase.execute({
      identityId,
      page: 3,
      limit: 10,
      status: ['Active', 'Paused'],
      outcome: ['Open'],
      archiveState: 'active',
      goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440002' as never,
      keyResultId: 'KeyResultId_550e8400-e29b-41d4-a716-446655440003' as never,
      labelIdsAll: ['label-work', 'label-ai'],
    });

    expect(result).toBeOk();
    expect(planRepository.findPage).toHaveBeenCalledWith(identityId, {
      status: ['Active', 'Paused'],
      outcome: ['Open'],
      archiveState: 'active',
      goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440002',
      keyResultId: 'KeyResultId_550e8400-e29b-41d4-a716-446655440003',
      labelIdsAll: ['label-work', 'label-ai'],
      limit: 10,
      offset: 20,
    });
    if (result.ok) {
      expect(result.data.plans).toHaveLength(1);
      expect(result.data.total).toBe(27);
    }
  });

  it('returns repository total independently from the bounded page length', async () => {
    const first = aOneTimeTask({ title: 'Task A' });
    const second = aOneTimeTask({ title: 'Task B' });
    vi.mocked(planRepository.findPage).mockResolvedValue({
      plans: [first, second],
      total: 123,
    });

    const result = await useCase.execute({ identityId, page: 1, limit: 2 });

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.plans.map((item) => item.name)).toEqual(['Task A', 'Task B']);
      expect(result.data.total).toBe(123);
    }
    expect(occurrenceRepository.getPlanStats).toHaveBeenCalledTimes(1);
  });
});
