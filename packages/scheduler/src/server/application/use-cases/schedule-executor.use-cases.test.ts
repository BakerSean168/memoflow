import { ScheduleTaskStatus } from '@memoflow/contracts/schedule';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleTask } from '../../domain/aggregates/schedule-task';
import type { IScheduleTaskRepository } from '../../domain/repositories/i-schedule-task-repository';
import { ExecuteScheduleTaskUseCase } from './execute-schedule-task.use-case';
import { FindDueScheduleTasksUseCase } from './find-due-schedule-tasks.use-case';
import { getCannotExecuteReason, type IScheduleTaskMonitor } from './schedule-executor-helpers';

function createMonitor(): IScheduleTaskMonitor {
  return {
    recordExecutionStart: vi.fn(),
    recordExecutionSuccess: vi.fn(),
    recordExecutionFailure: vi.fn(),
    recordExecutionSkipped: vi.fn(),
  };
}

function createTask(overrides: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    id: 'schedule-task-1',
    taskName: 'Daily summary',
    execute: vi.fn(() => true),
    status: ScheduleTaskStatus.Active,
    enabled: true,
    nextRunAt: new Date('2026-08-06T09:00:00.000Z'),
    maxExecutions: null,
    executionCount: 0,
    ...overrides,
  } as unknown as ScheduleTask;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ExecuteScheduleTaskUseCase', () => {
  it('records and persists a successful execution', async () => {
    const task = createTask();
    const repository = { save: vi.fn() } as unknown as IScheduleTaskRepository;
    const monitor = createMonitor();

    await new ExecuteScheduleTaskUseCase(repository, monitor).execute(task);

    expect(task.execute).toHaveBeenCalledOnce();
    expect(repository.save).toHaveBeenCalledWith(task);
    expect(monitor.recordExecutionStart).toHaveBeenCalledWith('schedule-task-1', 'Daily summary');
    expect(monitor.recordExecutionSuccess).toHaveBeenCalledWith('schedule-task-1', 'Daily summary');
    expect(monitor.recordExecutionFailure).not.toHaveBeenCalled();
  });

  it('records a false execution result as a failure without saving', async () => {
    const task = createTask({ execute: vi.fn(() => false) });
    const repository = { save: vi.fn() } as unknown as IScheduleTaskRepository;
    const monitor = createMonitor();

    await expect(new ExecuteScheduleTaskUseCase(repository, monitor).execute(task)).rejects.toThrow(
      'Task execution returned false',
    );

    expect(repository.save).not.toHaveBeenCalled();
    expect(monitor.recordExecutionFailure).toHaveBeenCalledWith(
      'schedule-task-1',
      'Daily summary',
      expect.objectContaining({ message: 'Task execution returned false' }),
    );
  });

  it('normalizes non-Error failures for monitoring and preserves the rejection', async () => {
    const task = createTask({
      execute: vi.fn(() => {
        throw 'executor unavailable';
      }),
    });
    const repository = { save: vi.fn() } as unknown as IScheduleTaskRepository;
    const monitor = createMonitor();

    await expect(new ExecuteScheduleTaskUseCase(repository, monitor).execute(task)).rejects.toBe(
      'executor unavailable',
    );

    expect(monitor.recordExecutionFailure).toHaveBeenCalledWith(
      'schedule-task-1',
      'Daily summary',
      expect.objectContaining({ message: 'executor unavailable' }),
    );
  });
});

describe('FindDueScheduleTasksUseCase', () => {
  it('queries the repository with the supplied cutoff and execution limit', async () => {
    const tasks = [createTask()];
    const repository = {
      findDueTasksForExecution: vi.fn().mockResolvedValue(tasks),
    } as unknown as IScheduleTaskRepository;

    await expect(
      new FindDueScheduleTasksUseCase(repository).execute(1_786_009_600_000),
    ).resolves.toBe(tasks);

    expect(repository.findDueTasksForExecution).toHaveBeenCalledWith(
      new Date(1_786_009_600_000),
      100,
    );
  });

  it('uses the current time by default and propagates repository failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T10:00:00.000Z'));
    const error = new Error('database unavailable');
    const repository = {
      findDueTasksForExecution: vi.fn().mockRejectedValue(error),
    } as unknown as IScheduleTaskRepository;

    await expect(new FindDueScheduleTasksUseCase(repository).execute()).rejects.toBe(error);
    expect(repository.findDueTasksForExecution).toHaveBeenCalledWith(
      new Date('2026-08-06T10:00:00.000Z'),
      100,
    );
  });
});

describe('getCannotExecuteReason', () => {
  it('reports status, enabled, due-time and execution-limit failures precisely', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T10:00:00.000Z'));

    expect(getCannotExecuteReason(createTask({ status: ScheduleTaskStatus.Paused }))).toContain(
      'Paused',
    );
    expect(getCannotExecuteReason(createTask({ enabled: false }))).toBe('任务未启用');
    expect(getCannotExecuteReason(createTask({ nextRunAt: null }))).toContain('N/A');
    expect(
      getCannotExecuteReason(createTask({ nextRunAt: new Date('2026-08-06T11:00:00.000Z') })),
    ).toContain('2026-08-06T11:00:00.000Z');
    expect(
      getCannotExecuteReason(
        createTask({
          nextRunAt: new Date('2026-08-06T09:00:00.000Z'),
          maxExecutions: 3,
          executionCount: 3,
        }),
      ),
    ).toBe('已达到最大执行次数: 3/3');
    expect(
      getCannotExecuteReason(createTask({ nextRunAt: new Date('2026-08-06T09:00:00.000Z') })),
    ).toBe('未知原因');
  });
});
