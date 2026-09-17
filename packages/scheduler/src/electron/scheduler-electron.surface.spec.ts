import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Scheduler Electron diagnostics surface', () => {
  const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

  it('registers only canonical Scheduler invocation diagnostic channels', () => {
    for (const channel of ['INVOCATION_LIST', 'INVOCATION_GET_BY_ID', 'INVOCATION_GET_DUE']) {
      expect(source).toContain(`SchedulerChannels.${channel}`);
    }
    expect(source).not.toContain('ScheduleChannels.TASK_');
    expect(source).not.toContain('ScheduleTask');
  });

  it('contains no worker mutation IPC handlers', () => {
    expect(source).not.toMatch(/(?:CREATE|UPDATE|DELETE|PAUSE|RESUME|COMPLETE|CANCEL).*SchedulerChannels/);
  });
});
