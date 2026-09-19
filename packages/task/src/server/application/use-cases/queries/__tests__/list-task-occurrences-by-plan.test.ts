import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { aTaskOccurrence, aOneTimeTask, TASK_TEST_OCCURRENCE_PROJECTION } from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import { ListTaskOccurrencesByPlanUseCase } from '../list-task-occurrences-by-plan.use-case';

describe('ListTaskOccurrencesByPlanUseCase', () => {
  let occurrenceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let planRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let useCase: ListTaskOccurrencesByPlanUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    occurrenceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByPlanId: vi.fn().mockResolvedValue([]),
    });
    planRepo = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn(),
    });
    useCase = new ListTaskOccurrencesByPlanUseCase(
      occurrenceRepo,
      planRepo,
      TASK_TEST_OCCURRENCE_PROJECTION,
    );
  });

  it('should return empty array when plan is not owned', async () => {
    vi.mocked(planRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('plan-1', 'identity-1');

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
    expect(occurrenceRepo.findByPlanId).not.toHaveBeenCalled();
  });

  it('should return empty array when no occurrences exist for plan', async () => {
    const plan = aOneTimeTask();
    vi.mocked(planRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
  });

  it('should return all occurrences for the plan', async () => {
    const plan = aOneTimeTask();
    const occurrence1 = await aTaskOccurrence({ planId: plan.id as any });
    const occurrence2 = await aTaskOccurrence({ planId: plan.id as any });
    vi.mocked(planRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(occurrenceRepo.findByPlanId).mockResolvedValue([occurrence1, occurrence2]);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe(occurrence1.id);
      expect(result.data[1].id).toBe(occurrence2.id);
    }
  });

  it('should pass identity and planId to ownership lookup', async () => {
    const plan = aOneTimeTask();
    vi.mocked(planRepo.findByIdForIdentity).mockResolvedValue(plan);

    await useCase.execute(plan.id, plan.identityId);

    expect(planRepo.findByIdForIdentity).toHaveBeenCalledWith(plan.identityId, plan.id);
    expect(occurrenceRepo.findByPlanId).toHaveBeenCalledWith(plan.id, plan.identityId);
  });
});
