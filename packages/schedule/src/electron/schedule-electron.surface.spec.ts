import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScheduleChannels } from '@memoflow/contracts/electron';

const calendarChannels = [
  'LIST',
  'LIST_BY_DATE_RANGE',
  'GET',
  'CREATE',
  'UPDATE',
  'DELETE',
  'GET_CONFLICTS',
  'DETECT_CONFLICTS',
  'CREATE_WITH_CONFLICT_DETECTION',
  'RESOLVE_CONFLICT',
] as const;

describe('Schedule Electron Calendar channel surface', () => {
  const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

  it('registers only Calendar channels through the shared ScheduleChannels contract', () => {
    expect(source).toContain("from '@memoflow/contracts/electron'");
    expect(source).toContain('const calendarChannels = [');
    for (const channel of calendarChannels) {
      expect(source).toContain(`ScheduleChannels.${channel}`);
      expect(ScheduleChannels).toHaveProperty(channel);
    }
    expect(source).not.toContain('ScheduleChannels.TASK_');
    expect(source).not.toMatch(/const EventCh = \{/);
    expect(source).not.toMatch(/const TaskCh = \{/);
  });

  it('does not resurrect unsupported complete/cancel/reschedule event channels', () => {
    expect(source).not.toContain("'schedule:complete'");
    expect(source).not.toContain("'schedule:cancel'");
    expect(source).not.toContain("'schedule:reschedule'");
  });

  it('forwards Calendar DELETE expectedVersion payload to the event controller', () => {
    expect(source).toMatch(
      /ScheduleChannels\.DELETE[\s\S]*controller\.delete\(id, payload, requestContext\)/,
    );
    expect(source).toMatch(/typeof input === 'number' \? \{ expectedVersion: input \} : input/);
  });
});
