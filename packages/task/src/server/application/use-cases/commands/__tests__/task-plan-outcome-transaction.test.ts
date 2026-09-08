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
import { aLoadedTaskPlan, aTaskOccurrence } from '../../../../../testing';
import { MarkTaskOccurrenceMissedUseCase } from '../mark-task-occurrence-missed.use-case';
import { CompleteTaskOccurrenceUseCase } from '../complete-task-occurrence.use-case';
import { createInlineTaskWriteTransactionRunner } from '../task-write-support';

describe('Task plan outcome transaction integration (TASK-2202)', () => {
  it('explicit Missed -> strict Failed, then late completion correction -> Succeeded in the same write runner', async () => {
    const template = aLoadedTaskPlan({
      completionPolicy: TaskPlanCompletionPolicy.StrictNoBackfill,
    });
    const instance = await aTaskOccurrence({
      templateId: template.id,
      identityId: template.identityId,
    });

    const templateRepository = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(template),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const instanceRepository = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(instance),
      findByTemplateId: vi.fn().mockResolvedValue([instance]),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const runner = createInlineTaskWriteTransactionRunner({ templateRepository, instanceRepository });

    const missed = await new MarkTaskOccurrenceMissedUseCase(instanceRepository, runner).execute(
      instance.id,
      instance.identityId,
      { reason: 'day not completed' },
    );
    expect(missed).toBeOk();
    expect(template.outcome).toBe(TaskPlanOutcome.Failed);
    expect(template.status).toBe(TaskPlanStatus.Closed);
    expect(templateRepository.save).toHaveBeenCalledWith(template);

    vi.mocked(templateRepository.save).mockClear();
    const corrected = await new CompleteTaskOccurrenceUseCase(
      instanceRepository,
      templateRepository,
      runner,
    ).execute(instance.id, instance.identityId);

    expect(corrected).toBeOk();
    expect(template.outcome).toBe(TaskPlanOutcome.Succeeded);
    expect(template.status).toBe(TaskPlanStatus.Closed);
    expect(templateRepository.save).toHaveBeenCalledWith(template);
  });
});
