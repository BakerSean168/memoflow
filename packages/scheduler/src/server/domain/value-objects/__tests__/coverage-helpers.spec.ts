import { describe, expect, it, vi } from 'vitest';
import { ExecutionInfo } from '../execution-info';
import { ExecutionStatus } from '../execution-status';
import { RetryPolicy } from '../retry-policy';
import { ScheduleConfig } from '../schedule-config';
import { ScheduleTaskStatus } from '../schedule-task-status';
import { SourceModule } from '../source-module';
import { TaskPriority } from '../task-priority';
import { Timezone } from '../timezone';

describe('scheduler value object coverage helpers', () => {
  it('covers execution status helpers', () => {
    expect(ExecutionStatus.of('Success')).toBe(ExecutionStatus.Success);
    expect(ExecutionStatus.isSuccess(ExecutionStatus.Success)).toBe(true);
    expect(ExecutionStatus.isFailed(ExecutionStatus.Timeout)).toBe(true);
    expect(ExecutionStatus.isCompleted(ExecutionStatus.Skipped)).toBe(true);
    expect(ExecutionStatus.isInProgress(ExecutionStatus.Retrying)).toBe(true);
    expect(ExecutionStatus.isTimeout(ExecutionStatus.Timeout)).toBe(true);
    expect(ExecutionStatus.getAll()).toEqual(['Success', 'Failed', 'Skipped', 'Timeout', 'Retrying']);
    expect(() => ExecutionStatus.of('bad')).toThrow('Invalid ExecutionStatus: bad');
  });

  it('covers schedule task status helpers', () => {
    expect(ScheduleTaskStatus.of('Active')).toBe(ScheduleTaskStatus.Active);
    expect(ScheduleTaskStatus.isActive(ScheduleTaskStatus.Active)).toBe(true);
    expect(ScheduleTaskStatus.isPaused(ScheduleTaskStatus.Paused)).toBe(true);
    expect(ScheduleTaskStatus.isCompleted(ScheduleTaskStatus.Completed)).toBe(true);
    expect(ScheduleTaskStatus.isTerminated(ScheduleTaskStatus.Cancelled)).toBe(true);
    expect(ScheduleTaskStatus.isExecutable(ScheduleTaskStatus.Active)).toBe(true);
    expect(ScheduleTaskStatus.getAll()).toEqual([
      'Active',
      'Paused',
      'Completed',
      'Cancelled',
      'Failed',
    ]);
    expect(() => ScheduleTaskStatus.of('bad')).toThrow('Invalid ScheduleTaskStatus: bad');
  });

  it('covers source module, task priority, and timezone helpers', () => {
    expect(SourceModule.of('Reminder')).toBe(SourceModule.Reminder);
    expect(SourceModule.isSystem(SourceModule.System)).toBe(true);
    expect(SourceModule.isBusiness(SourceModule.Goal)).toBe(true);
    expect(SourceModule.isCustom(SourceModule.Custom)).toBe(true);

    expect(TaskPriority.of('Urgent')).toBe(TaskPriority.Urgent);
    expect(TaskPriority.toNumber(TaskPriority.High)).toBe(3);
    expect(TaskPriority.isHighPriority(TaskPriority.Urgent)).toBe(true);
    expect(TaskPriority.isUrgent(TaskPriority.Urgent)).toBe(true);

    expect(Timezone.of('Asia/Tokyo')).toBe(Timezone.Tokyo);
    expect(Timezone.getUtcOffset(Timezone.Shanghai)).toBe(8);
    expect(Timezone.isAsia(Timezone.Tokyo)).toBe(true);
    expect(Timezone.isAmerica(Timezone.NewYork)).toBe(true);
    expect(Timezone.isEurope(Timezone.London)).toBe(true);

  });

  it('covers additional execution info, retry policy, and schedule config branches', () => {
    const execution = ExecutionInfo.fromDTO({
      nextRunAt: '2026-04-27T10:00:00.000Z',
      lastRunAt: '2026-04-27T09:00:00.000Z',
      executionCount: 2,
      lastExecutionStatus: 'Failed',
      lastExecutionDuration: 1500,
      consecutiveFailures: 2,
    });
    expect(execution.hasExecuted).toBe(true);
    expect(execution.isHealthy).toBe(false);
    expect(execution.healthStatus).toBe('warning');
    expect(execution.lastExecutionDurationMs).toBe(1500);
    expect(execution.setNextRunAt(null).nextRunAt).toBeNull();

    const disabledPolicy = RetryPolicy.createDisabled();
    expect(disabledPolicy.isDisabled).toBe(true);
    expect(disabledPolicy.policyDescription).toBe('已禁用');
    expect(disabledPolicy.retryDelayFormatted).toBe('0 秒');
    expect(disabledPolicy.maxRetryDelayFormatted).toBe('0 秒');
    expect(() =>
      RetryPolicy.create({
        enabled: true,
        maxRetries: 0,
        retryDelay: 1,
        backoffMultiplier: 1,
        maxRetryDelay: 10,
      }),
    ).toThrow('maxRetries must be at least 1 when enabled');

    const oneShot = ScheduleConfig.create({
      cronExpression: null,
      timezone: Timezone.UTC,
      startDate: new Date('2026-04-28T10:00:00.000Z').toISOString(),
      endDate: null,
      maxExecutions: 1,
    });
    expect(oneShot.calculateNextRun(new Date('2026-04-27T10:00:00.000Z').getTime())).toBe(
      new Date('2026-04-28T10:00:00.000Z').getTime(),
    );
    expect(oneShot.calculateNextRun(new Date('2026-04-29T10:00:00.000Z').getTime())).toBeNull();

    const invalidCron = ScheduleConfig.create({
      cronExpression: 'invalid',
      timezone: Timezone.UTC,
      startDate: null,
      endDate: null,
      maxExecutions: null,
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(invalidCron.calculateNextRun()).toBeNull();
    consoleErrorSpy.mockRestore();
    expect(ScheduleConfig.createDefault(Timezone.UTC).setDateRange(null, null).toDTO().endDate).toBeNull();
  });
});
