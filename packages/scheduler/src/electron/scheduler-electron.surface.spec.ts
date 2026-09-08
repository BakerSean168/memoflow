import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Temporal Engine Electron transport remains read-only and protocol-compatible. */
describe('Scheduler Electron diagnostics surface', () => {
  const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

  it('registers only Scheduler task diagnostic channels', () => {
    for (const channel of ['TASK_LIST', 'TASK_GET_BY_ID', 'TASK_GET_DUE', 'TASK_GET_BY_SOURCE']) {
      expect(source).toContain(`ScheduleChannels.${channel}`);
    }
    for (const calendarChannel of ['CREATE', 'UPDATE', 'DELETE', 'GET_CONFLICTS', 'RESOLVE_CONFLICT']) {
      expect(source).not.toContain(`ScheduleChannels.${calendarChannel}`);
    }
  });

  it('contains no raw worker mutation IPC handlers', () => {
    for (const mutation of ['TASK_CREATE', 'TASK_PAUSE', 'TASK_RESUME', 'TASK_COMPLETE', 'TASK_CANCEL', 'TASK_DELETE']) {
      expect(source).not.toContain(`ScheduleChannels.${mutation}`);
    }
  });
});
