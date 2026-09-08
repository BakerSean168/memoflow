import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPlanStatus } from '@memoflow/contracts/task';
import { createTaskOccurrenceMaintenanceRuntime } from '../task-occurrence-maintenance-runtime';

function createDeps() {
  const templates = [
    { id: 'tpl-1', status: TaskPlanStatus.Active, lastGeneratedDate: null },
  ];
  const templateRepository = {
    findNeedGenerateInstances: vi.fn().mockResolvedValue(templates),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const instanceRepository = {
    saveMany: vi.fn().mockResolvedValue(undefined),
  };
  return { templateRepository, instanceRepository };
}

describe('TaskOccurrenceMaintenanceRuntime (R2-3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('runs an immediate refill pass on start and generates missing instances', async () => {
    const { templateRepository, instanceRepository } = createDeps();
    const generateInstances = vi.fn().mockReturnValue([{ id: 'i-1' }]);
    const runtime = createTaskOccurrenceMaintenanceRuntime({
      taskPlanRepository: templateRepository as never,
      taskOccurrenceRepository: instanceRepository as never,
      generationService: { generateInstances } as never,
      now: () => 1_700_000_000_000,
    });

    await runtime.start();

    // 立即补一轮：查询需要补充的模板 → 生成 → 保存实例与模板游标。
    expect(templateRepository.findNeedGenerateInstances).toHaveBeenCalledTimes(1);
    expect(generateInstances).toHaveBeenCalledTimes(1);
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
      generationService: { generateInstances } as never,
      now: () => 1_700_000_000_000,
    });

    await runtime.start();

    expect(generateInstances).toHaveBeenCalledTimes(1);
    expect(instanceRepository.saveMany).not.toHaveBeenCalled();
    expect(templateRepository.save).not.toHaveBeenCalled();

    await runtime.stop();
  });
});
