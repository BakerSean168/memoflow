import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReminderChannels } from '@memoflow/contracts/electron';

/**
 * Reminder IPC adapter surface (stage-6 residual):
 * Invokes contracts ReminderChannels only — no local REMINDER_CHANNELS dual map.
 */
describe('ReminderIpcAdapter channel surface', () => {
  const source = readFileSync(resolve(__dirname, 'reminder-ipc.adapter.ts'), 'utf8');

  it('invokes ReminderChannels and does not define a local channel map', () => {
    expect(source).toContain("import { ReminderChannels } from '@memoflow/contracts/electron'");
    expect(source).not.toMatch(/const REMINDER_CHANNELS = \{/);
    expect(source).toContain('ReminderChannels.TEMPLATE_CREATE');
    expect(source).toContain('ReminderChannels.TEMPLATE_LIST');
    expect(source).toContain('ReminderChannels.GROUP_LIST');
    expect(source).toContain('ReminderChannels.PREFERENCES_UPDATE');
  });

  it('covers all ReminderChannels values via adapter invokes', () => {
    for (const channel of Object.values(ReminderChannels)) {
      // Adapter source must mention each channel string only via ReminderChannels.* keys;
      // ensure each contracts key is referenced.
      const key = Object.entries(ReminderChannels).find(([, value]) => value === channel)?.[0];
      expect(key).toBeTruthy();
      expect(source).toContain(`ReminderChannels.${key}`);
    }
  });

  it('does not expose retired per-user list IPC channels or adapter methods', () => {
    expect('TEMPLATE_GET_BY_USER' in ReminderChannels).toBe(false);
    expect('GROUP_GET_BY_USER' in ReminderChannels).toBe(false);
    expect(source).not.toContain('getUserTemplates');
    expect(source).not.toContain('getUserReminderGroups');
    expect(source).not.toContain('TEMPLATE_GET_BY_USER');
    expect(source).not.toContain('GROUP_GET_BY_USER');
  });
});
