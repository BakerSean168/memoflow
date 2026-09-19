import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { TaskPlanScheduleKind } from '@memoflow/contracts/task';
import {
  aDailyRecurrence,
  aLoadedTaskPlan,
  anAllDayTiming,
  canonicalTaskPlanScheduleForTest,
  aTaskOccurrence,
  TASK_TEST_USER_TIME_CONTEXT_PORT,
} from '../../../../../testing';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { GenerateTaskOccurrencesUseCase } from '../generate-task-occurrences.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';

describe('GenerateTaskOccurrencesUseCase (TASK-2204)', () => {
  let templateRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: GenerateTaskOccurrencesUseCase;

  beforeEach(() => {
    templateRepo = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    });
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByPlanId: vi.fn().mockResolvedValue([]),
      saveMany: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new GenerateTaskOccurrencesUseCase(
      templateRepo,
      instanceRepo,
      createInlineTaskWriteTransactionRunner({
        planRepository: templateRepo,
        occurrenceRepository: instanceRepo,
      }),
      TASK_TEST_USER_TIME_CONTEXT_PORT,
    );
  });

  it('filters already persisted occurrence days before returning generated DTOs', async () => {
    const start = Date.UTC(2026, 0, 1, 0, 0, 0);
    const plan = aLoadedTaskPlan({
      schedule: canonicalTaskPlanScheduleForTest(
        TaskPlanScheduleKind.Recurring,
        start,
        anAllDayTiming(),
        aDailyRecurrence(),
      ),
    });
    const existing = await aTaskOccurrence({
      planId: plan.id,
      identityId: plan.identityId,
      occurrenceDate: start,
      timing: anAllDayTiming(),
    });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);
    vi.mocked(instanceRepo.findByPlanId).mockResolvedValue([existing]);

    const result = await useCase.execute(String(plan.id), String(plan.identityId), {
      fromDate: start,
      toDate: Date.UTC(2026, 0, 2, 23, 59, 59, 999),
    });

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.map((occurrence) => occurrence.scheduleSnapshot.date)).toEqual(['2026-01-02']);
    }
    expect(instanceRepo.saveMany).toHaveBeenCalledTimes(1);
    expect(vi.mocked(instanceRepo.saveMany).mock.calls[0][0]).toHaveLength(1);
  });
});
