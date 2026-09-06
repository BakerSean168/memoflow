import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScheduleChannels } from '@memoflow/contracts/electron';

/** Schedule IPC adapters use contract channels; raw worker IPC is read-only. */
describe('Schedule IPC adapters channel surface', () => {
  const files = ['schedule-event-ipc.adapter.ts', 'schedule-task-ipc.adapter.ts'] as const;

  it.each(files)('%s uses ScheduleChannels and no local channel map', (fileName) => {
    const source = readFileSync(resolve(__dirname, fileName), 'utf8');
    expect(source).toContain("import { ScheduleChannels } from '@memoflow/contracts/electron'");
    expect(source).not.toMatch(/const SCHEDULE_[A-Z_]*CHANNELS = \{/);
    expect(source).toContain('ScheduleChannels.');
  });

  it('keeps event commands and raw worker diagnostics only', () => {
    const event = readFileSync(resolve(__dirname, 'schedule-event-ipc.adapter.ts'), 'utf8');
    const task = readFileSync(resolve(__dirname, 'schedule-task-ipc.adapter.ts'), 'utf8');
    expect(event).toContain('ScheduleChannels.CREATE');
    expect(event).toContain('ScheduleChannels.RESOLVE_CONFLICT');
    expect(task).toContain('ScheduleChannels.TASK_LIST');
    expect(task).toContain('ScheduleChannels.TASK_GET_BY_ID');
    expect(task).toContain('ScheduleChannels.TASK_GET_DUE');
    expect(task).toContain('ScheduleChannels.TASK_GET_BY_SOURCE');

    for (const channel of [
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
      expect(ScheduleChannels).not.toHaveProperty(channel);
      expect(task).not.toContain(`ScheduleChannels.${channel}`);
    }
  });
});
