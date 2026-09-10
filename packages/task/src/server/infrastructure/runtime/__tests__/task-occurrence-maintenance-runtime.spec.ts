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
  const templates = [
    { id: 'tpl-1', identityId: 'identity-1', status: TaskPlanStatus.Active, lastGeneratedDate: null },
  ];
  const templateRepository = {
    findNeedGenerateInstances: vi.fn().mockResolvedValue(templates),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const instanceRepository = {
    saveMany: vi.fn().mockResolvedValue(undefined),
  };
  return { templates, templateRepository, instanceRepository };
}

describe('TaskOccurrenceMaintenanceRuntime (R2-3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TEST_USER_TIME_CONTEXT_PORT.getUserTimeContext.mockClear();
  });

  it('runs an immediate refill pass on start and generates missing instances', async () => {
    const { templates, templateRepository, instanceRepository } = createDeps();
    const generateInstances = vi.fn().mockReturnValue([{ id: 'i-1' }]);
    const runtime = createTaskOccurrenceMaintenanceRuntime({
      taskPlanRepository: templateRepository as never,
      taskOccurrenceRepository: instanceRepository as never,
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      generationService: { generateInstances } as never,
      now: () => Date.parse('2026-03-08T04:30:00.000Z'),
    });

    await runtime.start();

    // 立即补一轮：查询需要补充的模板 → 生成 → 保存实例与模板游标。
    expect(templateRepository.findNeedGenerateInstances).toHaveBeenCalledTimes(1);
    expect(generateInstances).toHaveBeenCalledTimes(1);
    expect(TEST_USER_TIME_CONTEXT_PORT.getUserTimeContext).toHaveBeenCalledWith('identity-1');
    const expectedNow = Date.parse('2026-03-08T04:30:00.000Z');
    const expectedTarget = Number(TEST_TIME.calendar.addDays(expectedNow, 100));
    expect(generateInstances).toHaveBeenCalledWith(templates[0], TEST_CONTEXT, {
      now: expectedNow,
      targetDate: expectedTarget,
    });
    expect(instanceRepository.saveMany).toHaveBeenCalledWith([{ id: 'i-1' }]);
    expect(templateRepository.save).toHaveBeenCalledTimes(1);

    await runtime.stop();
  });

  it('skips generation when the generator yields no instances', async () => {
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
