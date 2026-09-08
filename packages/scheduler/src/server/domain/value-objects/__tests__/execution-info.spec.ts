import { describe, expect, it } from 'vitest';
import { ExecutionStatus } from '@memoflow/contracts/schedule';
import { ExecutionInfo } from '../execution-info';

describe('ExecutionInfo', () => {
  it('creates an empty execution snapshot with healthy defaults', () => {
    const info = ExecutionInfo.createEmpty();

    expect(info.executionCount).toBe(0);
    expect(info.nextRunAt).toBeNull();
    expect(info.healthStatus).toBe('healthy');
    expect(info.hasExecuted).toBe(false);
  });

  it('updates execution counters and resets failures after a success', () => {
    const info = ExecutionInfo.fromDTO({
      nextRunAt: null,
      lastRunAt: null,
      executionCount: 2,
      lastExecutionStatus: ExecutionStatus.Failed,
      lastExecutionDuration: 200,
      consecutiveFailures: 2,
    });

    const updated = info.updateAfterExecution({
      executedAt: new Date('2026-01-01T00:00:00.000Z').getTime(),
      status: ExecutionStatus.Success,
      duration: 120,
      nextRunAt: new Date('2026-01-02T00:00:00.000Z').getTime(),
    });

    expect(updated.executionCount).toBe(3);
    expect(updated.lastExecutionStatus).toBe(ExecutionStatus.Success);
    expect(updated.consecutiveFailures).toBe(0);
    expect(updated.healthStatus).toBe('healthy');
  });

  it('tracks failure health and DTO round-trip', () => {
    const info = ExecutionInfo.fromDTO({
      nextRunAt: '2026-01-03T00:00:00.000Z',
      lastRunAt: '2026-01-02T00:00:00.000Z',
      executionCount: 4,
      lastExecutionStatus: ExecutionStatus.Failed,
      lastExecutionDuration: 500,
      consecutiveFailures: 4,
    });

    const reset = info.resetFailures().setNextRunAt(new Date('2026-01-04T00:00:00.000Z').getTime());

    expect(info.healthStatus).toBe('critical');
    expect(reset.consecutiveFailures).toBe(0);
    expect(reset.toDTO()).toEqual({
      nextRunAt: '2026-01-04T00:00:00.000Z',
      lastRunAt: '2026-01-02T00:00:00.000Z',
      executionCount: 4,
      lastExecutionStatus: ExecutionStatus.Failed,
      lastExecutionDuration: 500,
      consecutiveFailures: 0,
    });
  });
});
