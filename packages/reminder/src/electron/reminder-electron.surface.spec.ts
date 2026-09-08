import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReminderChannels } from '@memoflow/contracts/electron';

/**
 * Reminder electron seam surface (stage-6 residual):
 * Channel registration must use contracts ReminderChannels only — no dual-track local Ch map.
 */
describe('ReminderElectronModule channel surface', () => {
  const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

  it('registers handlers via ReminderChannels and does not redefine a local Ch map', () => {
    expect(source).toContain('ReminderChannels');
    expect(source).toContain("from '@memoflow/contracts/electron'");
    expect(source).not.toMatch(/const Ch = \{/);
    expect(source).toContain('Object.values(ReminderChannels)');
    expect(source).toContain('ReminderChannels.TEMPLATE_LIST');
    expect(source).toContain('ReminderChannels.GROUP_LIST');
    expect(source).toContain('ReminderChannels.PREFERENCES_GET');
  });

  it('keeps live ReminderChannels names stable', () => {
    expect(ReminderChannels.TEMPLATE_CREATE).toBe('reminder:template:create');
    expect(ReminderChannels.GROUP_CREATE).toBe('reminder:group:create');
    expect(ReminderChannels.PREFERENCES_UPDATE).toBe('reminder:preferences:update');
  });

  it('does not register retired duplicate per-user list channels', () => {
    expect('TEMPLATE_GET_BY_USER' in ReminderChannels).toBe(false);
    expect('GROUP_GET_BY_USER' in ReminderChannels).toBe(false);
    expect(source).not.toContain('TEMPLATE_GET_BY_USER');
    expect(source).not.toContain('GROUP_GET_BY_USER');
  });
});
