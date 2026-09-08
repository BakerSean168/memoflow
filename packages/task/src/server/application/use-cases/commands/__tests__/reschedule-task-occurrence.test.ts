import { describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { asInstant, createTimeFacade } from '@memoflow/time';
import {
  aTaskOccurrence,
  aTaskPlanId,
  anIdentityId,
  aTimePointConfig,
} from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { RescheduleTaskOccurrenceUseCase } from '../reschedule-task-occurrence.use-case';

const time = createTimeFacade();

function target(dayOffset = 1, minute = 16 * 60) {
  const start = time.calendar.startOfDay(asInstant(Date.now() + dayOffset * 86_400_000));
  return {
    start,
    newTime: {
      timeType: 'TimePoint' as const,
      startDate: Number(start),
      timePoint: minute,
      timeRange: null,
    },
  };
}

describe('RescheduleTaskOccurrenceUseCase (PLAN-4303)', () => {
  it('reschedules the owned occurrence, bumps revision, and persists only the instance', async () => {
    const identityId = anIdentityId();
    const templateId = aTaskPlanId();
    const instance = await aTaskOccurrence({
      identityId,
      templateId,
      timeConfig: aTimePointConfig(14 * 60),
    });
    const repo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(instance),
      findByTemplateIdAndDateRange: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new RescheduleTaskOccurrenceUseCase(repo);
    const { start, newTime } = target(1, 16 * 60);

    const result = await useCase.execute(instance.id, String(identityId), {
      newTime,
      expectedVersion: 1,
    });

    expect(result).toBeOk();
    expect(instance.version).toBe(2);
    expect(instance.instanceDate).toBe(Number(start));
    expect(instance.timeConfig.toDTO()).toEqual(newTime);
    expect(repo.save).toHaveBeenCalledWith(instance);
  });

  it('rejects a stale Planner revision before mutation', async () => {
    const identityId = anIdentityId();
    const instance = await aTaskOccurrence({ identityId });
    const repo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(instance),
      findByTemplateIdAndDateRange: vi.fn(),
      save: vi.fn(),
    });
    const useCase = new RescheduleTaskOccurrenceUseCase(repo);

    const result = await useCase.execute(instance.id, String(identityId), {
      newTime: target().newTime,
      expectedVersion: 99,
    });

    expect(result).toBeErrorWithCode('CONFLICT');
    expect(instance.version).toBe(1);
    expect(repo.findByTemplateIdAndDateRange).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects a target-day occurrence collision before persistence', async () => {
    const identityId = anIdentityId();
    const templateId = aTaskPlanId();
    const source = await aTaskOccurrence({ identityId, templateId });
    const { start, newTime } = target();
    const collision = await aTaskOccurrence({
      identityId,
      templateId,
      instanceDate: Number(start),
      timeConfig: aTimePointConfig(9 * 60, new Date(Number(start))),
    });
    const repo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(source),
      findByTemplateIdAndDateRange: vi.fn().mockResolvedValue([collision]),
      save: vi.fn(),
    });
    const useCase = new RescheduleTaskOccurrenceUseCase(repo);

    const result = await useCase.execute(source.id, String(identityId), {
      newTime,
      expectedVersion: source.version,
    });

    expect(result).toBeErrorWithCode('CONFLICT');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('does not reschedule terminal task occurrences', async () => {
    const identityId = anIdentityId();
    const instance = await aTaskOccurrence({ identityId });
    instance.complete();
    const repo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(instance),
      findByTemplateIdAndDateRange: vi.fn(),
      save: vi.fn(),
    });
    const useCase = new RescheduleTaskOccurrenceUseCase(repo);

    const result = await useCase.execute(instance.id, String(identityId), {
      newTime: target().newTime,
      expectedVersion: instance.version,
    });

    expect(result).toBeErrorWithCode('VALIDATION_ERROR');
    expect(repo.save).not.toHaveBeenCalled();
  });
});
