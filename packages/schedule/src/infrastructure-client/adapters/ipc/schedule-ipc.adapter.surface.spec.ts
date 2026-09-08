import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** @memoflow/schedule IPC adapter is Calendar-only after CLEAN-6304. */
describe('Schedule IPC Calendar adapter surface', () => {
  const event = readFileSync(resolve(__dirname, 'schedule-event-ipc.adapter.ts'), 'utf8');

  it('uses the shared contract channel map with no local duplicate', () => {
    expect(event).toContain("import { ScheduleChannels } from '@memoflow/contracts/electron'");
    expect(event).not.toMatch(/const SCHEDULE_[A-Z_]*CHANNELS = \{/);
    expect(event).toContain('ScheduleChannels.CREATE');
    expect(event).toContain('ScheduleChannels.RESOLVE_CONFLICT');
  });

  it('contains no Temporal Engine task channels', () => {
    expect(event).not.toContain('ScheduleChannels.TASK_');
  });
});
