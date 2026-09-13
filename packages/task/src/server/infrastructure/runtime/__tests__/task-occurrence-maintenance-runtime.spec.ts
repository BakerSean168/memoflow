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
  const existingInstances = [{ id: 'existing-1', scheduleDate: '2026-03-09' }];
  const templateRepository = {
    findActiveRecurringPlansForMaterialization: vi.fn().mockResolvedValue(plans),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const instanceRepository = {
    findByTemplateId: vi.fn().mockResolvedValue(existingInstances),
    saveMany: vi.fn().mockResolvedValue(undefined),
  };
  return { plans, existingInstances, templateRepository, instanceRepository };
}

describe('TaskOccurrenceMaintenanceRuntime (R2-3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TEST_USER_TIME_CONTEXT_PORT.getUserTimeContext.mockClear();
  });

  it('reconciles active recurring plans against existing occurrence facts on start', async () => {
    const { plans, existingInstances, templateRepository, instanceRepository } = createDeps();
    const generateInstances = vi.fn().mockReturnValue([{ id: 'i-1' }]);
    const runtime = createTaskOccurrenceMaintenanceRuntime({
      taskPlanRepository: templateRepository as never,
      taskOccurrenceRepository: instanceRepository as never,
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      generationService: { generateInstances } as never,
      now: () => Date.parse('2026-03-08T04:30:00.000Z'),
    });

    await runtime.start();

    expect(templateRepository.findActiveRecurringPlansForMaterialization).toHaveBeenCalledTimes(1);
    expect(instanceRepository.findByTemplateId).toHaveBeenCalledWith('tpl-1', 'identity-1');
    expect(TEST_USER_TIME_CONTEXT_PORT.getUserTimeContext).toHaveBeenCalledWith('identity-1');
    const expectedNow = Date.parse('2026-03-08T04:30:00.000Z');
    const expectedTarget = Number(TEST_TIME.calendar.addDays(expectedNow, 100));
    expect(generateInstances).toHaveBeenCalledWith(plans[0], TEST_CONTEXT, {
      now: expectedNow,
      targetDate: expectedTarget,
      existingInstances,
    });
    expect(instanceRepository.saveMany).toHaveBeenCalledWith([{ id: 'i-1' }]);
    // Plan save flushes the generated domain event; it is not a generation-cursor write.
    expect(templateRepository.save).toHaveBeenCalledTimes(1);

    await runtime.stop();
  });

  it('does not persist Plan or occurrences when reconciliation finds no hole', async () => {
    const { templateRepository, instanceRepository } = createDeps();
    const generateInstances = vi.fn().mockReturnValue([]);
    const runtime = createTaskOccurrenceMaintenanceRuntime({
      taskPlanRepository: templateRepository as never,
      taskOccurrenceRepository: instanceRepository as never,
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      generationService: { generateInstances } as never,
      now: () => Date.parse('2026-03-08T04:30:00.000Z'),
    });

    await runtime.start();

    expect(generateInstances).toHaveBeenCalledTimes(1);
    expect(instanceRepository.saveMany).not.toHaveBeenCalled();
    expect(templateRepository.save).not.toHaveBeenCalled();

    await runtime.stop();
  });
});
