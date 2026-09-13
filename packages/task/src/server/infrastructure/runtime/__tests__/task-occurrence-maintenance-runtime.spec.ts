import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlanStatus } from '@memoflow/contracts/task';
import { createTimeContext, createTimeFacade } from '@memoflow/time';
import { createTaskOccurrenceMaintenanceRuntime } from '../task-occurrence-maintenance-runtime';

const TEST_CONTEXT = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
const TEST_TIME = createTimeFacade({ context: TEST_CONTEXT });
const TEST_USER_TIME_CONTEXT_PORT = {
  getUserTimeContext: vi.fn().mockResolvedValue(TEST_CONTEXT),
};

function createDeps() {
  const plans = [{ id: 'tpl-1', identityId: 'identity-1', status: TaskPlanStatus.Active }];
  const existingOccurrences = [{ id: 'existing-1', scheduleDate: '2026-03-09' }];
  const planRepository = {
    findActiveRecurringPlansForMaterialization: vi.fn().mockResolvedValue(plans),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const occurrenceRepository = {
    findByPlanId: vi.fn().mockResolvedValue(existingOccurrences),
    saveMany: vi.fn().mockResolvedValue(undefined),
  };
  return { plans, existingOccurrences, planRepository, occurrenceRepository };
}

describe('TaskOccurrenceMaintenanceRuntime (R2-3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TEST_USER_TIME_CONTEXT_PORT.getUserTimeContext.mockClear();
  });

  it('reconciles active recurring plans against existing occurrence facts on start', async () => {
    const { plans, existingOccurrences, planRepository, occurrenceRepository } = createDeps();
    const generateOccurrences = vi.fn().mockReturnValue([{ id: 'i-1' }]);
    const runtime = createTaskOccurrenceMaintenanceRuntime({
      taskPlanRepository: planRepository as never,
      taskOccurrenceRepository: occurrenceRepository as never,
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      generationService: { generateOccurrences } as never,
      now: () => Date.parse('2026-03-08T04:30:00.000Z'),
    });

    await runtime.start();

    expect(planRepository.findActiveRecurringPlansForMaterialization).toHaveBeenCalledTimes(1);
    expect(occurrenceRepository.findByPlanId).toHaveBeenCalledWith('tpl-1', 'identity-1');
    expect(TEST_USER_TIME_CONTEXT_PORT.getUserTimeContext).toHaveBeenCalledWith('identity-1');
    const expectedNow = Date.parse('2026-03-08T04:30:00.000Z');
    const expectedTarget = Number(TEST_TIME.calendar.addDays(expectedNow, 100));
    expect(generateOccurrences).toHaveBeenCalledWith(plans[0], TEST_CONTEXT, {
      now: expectedNow,
      targetDate: expectedTarget,
      existingOccurrences,
    });
    expect(occurrenceRepository.saveMany).toHaveBeenCalledWith([{ id: 'i-1' }]);
    // Plan save flushes the generated domain event; it is not a generation-cursor write.
    expect(planRepository.save).toHaveBeenCalledTimes(1);

    await runtime.stop();
  });

  it('does not persist Plan or occurrences when reconciliation finds no hole', async () => {
    const { planRepository, occurrenceRepository } = createDeps();
    const generateOccurrences = vi.fn().mockReturnValue([]);
    const runtime = createTaskOccurrenceMaintenanceRuntime({
      taskPlanRepository: planRepository as never,
      taskOccurrenceRepository: occurrenceRepository as never,
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      generationService: { generateOccurrences } as never,
      now: () => Date.parse('2026-03-08T04:30:00.000Z'),
    });

    await runtime.start();

    expect(generateOccurrences).toHaveBeenCalledTimes(1);
    expect(occurrenceRepository.saveMany).not.toHaveBeenCalled();
    expect(planRepository.save).not.toHaveBeenCalled();

    await runtime.stop();
  });
});
