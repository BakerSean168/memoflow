import { describe, expect, it } from 'vitest';
import { ScheduleChannels, SchedulerChannels } from './ipc-channels';

describe('Schedule/Scheduler IPC surface', () => {
  it('keeps Calendar product channels free of retired worker-job channels', () => {
    expect(ScheduleChannels.LIST).toBe('schedule:list');
    expect(ScheduleChannels.CREATE_WITH_CONFLICT_DETECTION).toBe(
      'schedule:create-with-conflict-detection',
    );
    for (const key of [
      'COMPLETE',
      'CANCEL',
      'RESCHEDULE',
      'TASK_LIST',
      'TASK_GET_BY_ID',
      'TASK_GET_DUE',
      'TASK_GET_BY_SOURCE',
    ]) {
      expect(ScheduleChannels).not.toHaveProperty(key);
    }
  });

  it('uses invocation language for read-only Scheduler diagnostics', () => {
    expect(SchedulerChannels).toEqual({
      INVOCATION_LIST: 'scheduler:invocation:list',
      INVOCATION_GET_BY_ID: 'scheduler:invocation:get-by-id',
      INVOCATION_GET_DUE: 'scheduler:invocation:get-due',
    });
  });

  it('does not expose raw Scheduler mutation channels', () => {
    for (const channel of Object.values(SchedulerChannels)) {
      expect(channel).not.toMatch(/create|update|delete|pause|resume|complete|cancel|retry|replay/);
    }
  });
});
