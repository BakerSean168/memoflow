import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** @memoflow/scheduler IPC is read-only Temporal Engine diagnostics. */
describe('Scheduler IPC diagnostics surface', () => {
  const source = readFileSync(resolve(__dirname, 'schedule-task-ipc.adapter.ts'), 'utf8');

  it('owns the four read-only worker channels', () => {
    for (const channel of ['TASK_LIST', 'TASK_GET_BY_ID', 'TASK_GET_DUE', 'TASK_GET_BY_SOURCE']) {
      expect(source).toContain(`ScheduleChannels.${channel}`);
    }
  });

  it('does not expose Calendar or worker mutation channels', () => {
    for (const channel of [
      'CREATE',
      'UPDATE',
      'DELETE',
      'TASK_CREATE',
      'TASK_PAUSE',
      'TASK_RESUME',
      'TASK_COMPLETE',
      'TASK_CANCEL',
      'TASK_DELETE',
    ]) {
      expect(source).not.toContain(`ScheduleChannels.${channel}`);
    }
  });
});
