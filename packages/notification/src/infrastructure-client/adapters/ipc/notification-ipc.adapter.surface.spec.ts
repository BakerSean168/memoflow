import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NotificationChannels } from '@memoflow/contracts/electron';

/**
 * Notification IPC adapter surface (stage-6 residual):
 * Invokes contracts NotificationChannels only — no local NOTIFICATION_CHANNELS dual map.
 */
describe('NotificationIpcAdapter channel surface', () => {
  const source = readFileSync(resolve(__dirname, 'notification-ipc.adapter.ts'), 'utf8');

  it('invokes NotificationChannels and does not define a local channel map', () => {
    expect(source).toContain("import { NotificationChannels } from '@memoflow/contracts/electron'");
    expect(source).not.toMatch(/const NOTIFICATION_CHANNELS = \{/);
    expect(source).toContain('NotificationChannels.LIST');
    expect(source).toContain('NotificationChannels.MARK_READ');
    expect(source).toContain('NotificationChannels.GET_UNREAD_COUNT');
    expect(source).toContain('NotificationChannels.PREFERENCES_GET');
    expect(source).toContain('NotificationChannels.PREFERENCES_UPDATE');
    expect(source).toContain('NotificationChannels.EXECUTE_ACTION');
  });

  it('does not invoke custom renderer channels from the CRUD adapter', () => {
    expect(source).not.toContain('NotificationChannels.CUSTOM_');
    expect(Object.values(NotificationChannels)).toContain('notification:custom:receive');
  });
});
