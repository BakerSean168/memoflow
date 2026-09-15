import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingChannels } from '@memoflow/contracts/electron';

describe('Setting Electron canonical IPC surface', () => {
  const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

  it('registers every surviving Setting channel through the contract registry', () => {
    for (const key of Object.keys(SettingChannels)) {
      expect(source).toContain(`SettingChannels.${key}`);
    }
  });

  it('does not remount legacy UserSetting RPCs', () => {
    expect(Object.values(SettingChannels)).not.toContain('setting:all');
    expect(Object.values(SettingChannels)).not.toContain('setting:defaults');
    expect(Object.values(SettingChannels)).not.toContain('setting:patch');
    expect(Object.values(SettingChannels)).not.toContain('setting:reset');
    expect(source).not.toContain('getUserSetting');
    expect(source).not.toContain('patchUserSetting');
    expect(source).not.toContain('resetUserSetting');
    expect(source).not.toContain('getDefaultSettings');
  });
});
