import { describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { asInstant, createTimeContext, createTimeFacade } from '@memoflow/time';
import {
  aTaskOccurrence,
  aTaskPlanId,
  anIdentityId,
  aTimePointConfig,
} from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { RescheduleTaskOccurrenceUseCase } from '../reschedule-task-occurrence.use-case';

const timeContext = createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 });
const time = createTimeFacade({ context: timeContext });
const userTimeContextPort = {
  getUserTimeContext: vi.fn().mockResolvedValue(timeContext),
};

function target(dayOffset = 1, minute = 16 * 60) {
  const start = time.calendar.startOfDay(asInstant(Date.now() + dayOffset * 86_400_000));
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return {
    start,
    scheduleSnapshot: {
      date: time.calendar.toYmd(start),
      timing: {
        kind: 'At' as const,
        time: `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}` as never,
      },
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
    const useCase = new RescheduleTaskOccurrenceUseCase(repo, userTimeContextPort);
    const { start, scheduleSnapshot } = target(1, 16 * 60);

    const result = await useCase.execute(instance.id, String(identityId), {
      scheduleSnapshot,
      expectedVersion: 1,
    });

    expect(result).toBeOk();
    expect(instance.version).toBe(2);
    expect(instance.scheduleDate).toBe(time.calendar.toYmd(start));
    expect(instance.scheduleSnapshot.toDTO()).toEqual({
      date: time.calendar.toYmd(start),
      timing: { kind: 'At', time: '16:00' },
    });
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
    const useCase = new RescheduleTaskOccurrenceUseCase(repo, userTimeContextPort);

    const result = await useCase.execute(instance.id, String(identityId), {
      scheduleSnapshot: target().scheduleSnapshot,
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
    const { start, scheduleSnapshot } = target();
    const collision = await aTaskOccurrence({
      identityId,
      templateId,
      instanceDate: Number(start),
      timeConfig: aTimePointConfig(9 * 60, new Date(Number(start))),
      timeContext,
    });
    const repo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(source),
      findByTemplateIdAndDateRange: vi.fn().mockResolvedValue([collision]),
      save: vi.fn(),
    });
    const useCase = new RescheduleTaskOccurrenceUseCase(repo, userTimeContextPort);

    const result = await useCase.execute(source.id, String(identityId), {
      scheduleSnapshot,
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
    const useCase = new RescheduleTaskOccurrenceUseCase(repo, userTimeContextPort);

    const result = await useCase.execute(instance.id, String(identityId), {
      scheduleSnapshot: target().scheduleSnapshot,
      expectedVersion: instance.version,
    });

    expect(result).toBeErrorWithCode('VALIDATION_ERROR');
    expect(repo.save).not.toHaveBeenCalled();
  });
});
