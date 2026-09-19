import { describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { createTimeContext, createTimeFacade } from '@memoflow/time';
import type { IGoalRepository } from '../../../../domain/repositories/i-goal-repository';
import { GetGoalReviewContextUseCase } from '../get-goal-review-context.use-case';

describe('GetGoalReviewContextUseCase Product Time window', () => {
  it('uses identity calendar days across spring-forward DST', async () => {
    const goal = { id: 'goal-id-1' } as any;
    const goalRepository = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
    });
    const systemContext = { summary: { recordCount: 0 } } as any;
    const contextBuilder = { build: vi.fn().mockResolvedValue(systemContext) };
    const timeContext = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
    const userTimeContextPort = {
      getUserTimeContext: vi.fn().mockResolvedValue(timeContext),
    };
    const now = Date.parse('2026-03-09T03:30:00.000Z'); // Mar 8 23:30 after spring-forward
    const useCase = new GetGoalReviewContextUseCase(
      goalRepository,
      contextBuilder as any,
      userTimeContextPort,
      () => now,
    );

    const result = await useCase.execute('goal-id-1', 'identity-1', 1);

    expect(result).toBeOk();
    const expectedStart = Number(createTimeFacade({ context: timeContext }).calendar.addDays(now, -1));
    expect(now - expectedStart).toBe(23 * 60 * 60 * 1000);
    expect(contextBuilder.build).toHaveBeenCalledWith(goal, {
      windowStartAt: expectedStart,
      windowEndAt: now,
    });
    expect(userTimeContextPort.getUserTimeContext).toHaveBeenCalledWith('identity-1');
  });

  it('does not resolve time context for a missing goal', async () => {
    const goalRepository = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
    });
    const contextBuilder = { build: vi.fn() };
    const userTimeContextPort = { getUserTimeContext: vi.fn() };
    const useCase = new GetGoalReviewContextUseCase(
      goalRepository,
      contextBuilder as any,
      userTimeContextPort as any,
    );

    const result = await useCase.execute('missing', 'identity-1');

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(userTimeContextPort.getUserTimeContext).not.toHaveBeenCalled();
    expect(contextBuilder.build).not.toHaveBeenCalled();
  });
});
