import { describe, expect, it } from 'vitest';
import { AccountChannels } from './ipc-channels';

/**
 * Account IPC surface (stage-6 residual):
 * Collapse get-profile triple dual-track to the single live GET_ME channel used by
 * AccountIpcAdapter. Drop unused list/get/current aliases with no renderer consumers.
 */
describe('AccountChannels surface', () => {
  it('does not expose retired list/get/current dual-track channels', () => {
    for (const key of ['LIST', 'GET', 'GET_CURRENT', 'GET_CURRENT_ALIAS'] as const) {
      expect(AccountChannels).not.toHaveProperty(key);
    }

    const values = Object.values(AccountChannels);
    for (const channel of ['account:list', 'account:get', 'account:current']) {
      expect(values).not.toContain(channel);
    }
  });

  it('keeps live account channels used by AccountIpcAdapter', () => {
    expect(AccountChannels.GET_ME).toBe('account:get-me');
    expect(AccountChannels.UPDATE_PROFILE).toBe('account:update-profile');
    expect(AccountChannels).not.toHaveProperty('UPDATE_SETTINGS');
    expect(Object.values(AccountChannels)).not.toContain('account:update-settings');
    expect(AccountChannels).not.toHaveProperty('CHECK_AVAILABILITY');
    expect(Object.values(AccountChannels)).not.toContain('account:check-availability');
    expect(AccountChannels.CLOSE).toBe('account:close');
  });
});
