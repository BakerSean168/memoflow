import { describe, expect, it } from 'vitest';
import { ScheduleChannels } from './ipc-channels';

/** Schedule IPC product surface: event commands + read-only worker diagnostics. */
describe('ScheduleChannels surface', () => {
  it('does not expose retired unsupported event lifecycle channels', () => {
    for (const key of ['COMPLETE', 'CANCEL', 'RESCHEDULE'] as const) {
      expect(ScheduleChannels).not.toHaveProperty(key);
    }
    for (const channel of ['schedule:complete', 'schedule:cancel', 'schedule:reschedule']) {
      expect(Object.values(ScheduleChannels)).not.toContain(channel);
    }
  });

  it('keeps live event channels and read-only raw worker diagnostics', () => {
    expect(ScheduleChannels.LIST).toBe('schedule:list');
    expect(ScheduleChannels.CREATE_WITH_CONFLICT_DETECTION).toBe(
      'schedule:create-with-conflict-detection',
    );
    expect(ScheduleChannels.TASK_LIST).toBe('schedule:task:list');
    expect(ScheduleChannels.TASK_GET_BY_ID).toBe('schedule:task:get-by-id');
    expect(ScheduleChannels.TASK_GET_DUE).toBe('schedule:task:get-due');
    expect(ScheduleChannels.TASK_GET_BY_SOURCE).toBe('schedule:task:get-by-source');
  });

  it('does not expose raw ScheduleTask mutation channels', () => {
    for (const key of [
      'TASK_CREATE',
      'TASK_CREATE_BATCH',
      'TASK_PAUSE',
      'TASK_RESUME',
      'TASK_COMPLETE',
      'TASK_CANCEL',
      'TASK_DELETE',
      'TASK_DELETE_BATCH',
      'TASK_UPDATE_METADATA',
    ]) {
      expect(ScheduleChannels).not.toHaveProperty(key);
    }
  });
});
