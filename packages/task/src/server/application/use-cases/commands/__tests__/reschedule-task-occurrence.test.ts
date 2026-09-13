import { describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { asInstant, createTimeContext, createTimeFacade } from '@memoflow/time';
import {
  aTaskOccurrence,
  aTaskPlanId,
  anIdentityId,
  aTimePointTiming,
  anAllDayTiming,
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
  it('reschedules the owned occurrence, bumps revision, and persists only the occurrence', async () => {
    const identityId = anIdentityId();
    const planId = aTaskPlanId();
    const occurrence = await aTaskOccurrence({
      identityId,
      planId,
      timing: aTimePointTiming(14 * 60),
    });
    const repo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(occurrence),
      findByPlanIdAndDateRange: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new RescheduleTaskOccurrenceUseCase(repo, userTimeContextPort);
    const { start, scheduleSnapshot } = target(1, 16 * 60);

    const result = await useCase.execute(occurrence.id, String(identityId), {
      scheduleSnapshot,
      expectedVersion: 1,
    });

    expect(result).toBeOk();
    expect(occurrence.version).toBe(2);
    expect(occurrence.scheduleDate).toBe(time.calendar.toYmd(start));
    expect(occurrence.scheduleSnapshot.toDTO()).toEqual({
      date: time.calendar.toYmd(start),
      timing: { kind: 'At', time: '16:00' },
    });
    expect(repo.save).toHaveBeenCalledWith(occurrence);
  });

  it('rejects a stale Planner revision before mutation', async () => {
    const identityId = anIdentityId();
    const occurrence = await aTaskOccurrence({ identityId, timing: anAllDayTiming() });
    const repo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(occurrence),
      findByPlanIdAndDateRange: vi.fn(),
      save: vi.fn(),
    });
    const useCase = new RescheduleTaskOccurrenceUseCase(repo, userTimeContextPort);

    const result = await useCase.execute(occurrence.id, String(identityId), {
      scheduleSnapshot: target().scheduleSnapshot,
      expectedVersion: 99,
    });

    expect(result).toBeErrorWithCode('CONFLICT');
    expect(occurrence.version).toBe(1);
    expect(repo.findByPlanIdAndDateRange).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects a target-day occurrence collision before persistence', async () => {
    const identityId = anIdentityId();
    const planId = aTaskPlanId();
    const source = await aTaskOccurrence({ identityId, planId });
    const { start, scheduleSnapshot } = target();
    const collision = await aTaskOccurrence({
      identityId,
      planId,
      occurrenceDate: Number(start),
      timing: aTimePointTiming(9 * 60),
      timeContext,
    });
    const repo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(source),
      findByPlanIdAndDateRange: vi.fn().mockResolvedValue([collision]),
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
    const occurrence = await aTaskOccurrence({ identityId });
    occurrence.complete();
    const repo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(occurrence),
      findByPlanIdAndDateRange: vi.fn(),
      save: vi.fn(),
    });
    const useCase = new RescheduleTaskOccurrenceUseCase(repo, userTimeContextPort);

    const result = await useCase.execute(occurrence.id, String(identityId), {
      scheduleSnapshot: target().scheduleSnapshot,
      expectedVersion: occurrence.version,
    });

    expect(result).toBeErrorWithCode('VALIDATION_ERROR');
    expect(repo.save).not.toHaveBeenCalled();
  });
});
