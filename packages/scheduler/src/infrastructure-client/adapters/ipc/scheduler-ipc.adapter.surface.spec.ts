import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Scheduler IPC diagnostics surface', () => {
  const source = readFileSync(resolve(__dirname, 'scheduler-diagnostics-ipc.adapter.ts'), 'utf8');

  it('uses canonical invocation diagnostics channels only', () => {
    for (const channel of ['INVOCATION_LIST', 'INVOCATION_GET_BY_ID', 'INVOCATION_GET_DUE']) {
      expect(source).toContain(`SchedulerChannels.${channel}`);
    }
    expect(source).not.toContain('ScheduleChannels');
    expect(source).not.toContain('ScheduleTask');
  });
});
