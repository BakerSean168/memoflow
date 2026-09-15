import { describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import {
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  TaskPlanStatus,
} from '@memoflow/contracts/task';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import { aLoadedTaskPlan, aTaskOccurrence, TASK_TEST_OCCURRENCE_PROJECTION } from '../../../../../testing';
import { MarkTaskOccurrenceMissedUseCase } from '../mark-task-occurrence-missed.use-case';
import { CompleteTaskOccurrenceUseCase } from '../complete-task-occurrence.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';

describe('Task plan outcome transaction integration (TASK-2202)', () => {
  it('explicit Missed -> strict Failed, then late completion correction -> Succeeded in the same write runner', async () => {
    const plan = aLoadedTaskPlan({
      completionPolicy: TaskPlanCompletionPolicy.StrictNoBackfill,
    });
    const occurrence = await aTaskOccurrence({
      planId: plan.id,
      identityId: plan.identityId,
    });

    const planRepository = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(plan),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const occurrenceRepository = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(occurrence),
      findByPlanId: vi.fn().mockResolvedValue([occurrence]),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const runner = createInlineTaskWriteTransactionRunner({ planRepository, occurrenceRepository });

    const missed = await new MarkTaskOccurrenceMissedUseCase(
      occurrenceRepository,
      runner,
      TASK_TEST_OCCURRENCE_PROJECTION,
    ).execute(
      occurrence.id,
      occurrence.identityId,
      { reason: 'day not completed' },
    );
    expect(missed).toBeOk();
    expect(plan.outcome).toBe(TaskPlanOutcome.Failed);
    expect(plan.status).toBe(TaskPlanStatus.Closed);
    expect(planRepository.save).toHaveBeenCalledWith(plan);

    vi.mocked(planRepository.save).mockClear();
    const corrected = await new CompleteTaskOccurrenceUseCase(
      occurrenceRepository,
      planRepository,
      runner,
      TASK_TEST_OCCURRENCE_PROJECTION,
    ).execute(occurrence.id, occurrence.identityId);

    expect(corrected).toBeOk();
    expect(plan.outcome).toBe(TaskPlanOutcome.Succeeded);
    expect(plan.status).toBe(TaskPlanStatus.Closed);
    expect(planRepository.save).toHaveBeenCalledWith(plan);
  });
});
