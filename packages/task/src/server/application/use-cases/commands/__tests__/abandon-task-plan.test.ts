import { describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { TaskPlanOutcome, TaskPlanStatus } from '@memoflow/contracts/task';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { aOneTimeTask, TASK_TEST_USER_TIME_CONTEXT_PORT } from '../../../../../testing';
import { AbandonTaskPlanUseCase } from '../abandon-task-plan.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';

describe('AbandonTaskPlanUseCase (TASK-2202)', () => {
  it('closes the plan as explicitly Abandoned without using delete', async () => {
    const plan = aOneTimeTask({ title: 'Try for 15 days' });
    const planRepository = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(plan),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const occurrenceRepository = createMockRepo<ITaskOccurrenceRepository>();
    const useCase = new AbandonTaskPlanUseCase(
      planRepository,
      createInlineTaskWriteTransactionRunner({ planRepository, occurrenceRepository }),
      TASK_TEST_USER_TIME_CONTEXT_PORT,
    );

    const result = await useCase.execute(plan.id, plan.identityId, {
      reason: 'User changed direction',
    });

    expect(result).toBeOk();
    expect(plan.status).toBe(TaskPlanStatus.Closed);
    expect(plan.outcome).toBe(TaskPlanOutcome.Abandoned);
    expect(plan.abandonedReason).toBe('User changed direction');
    expect(plan.deletedAt).toBeNull();
    expect(planRepository.save).toHaveBeenCalledWith(plan);
  });
});
