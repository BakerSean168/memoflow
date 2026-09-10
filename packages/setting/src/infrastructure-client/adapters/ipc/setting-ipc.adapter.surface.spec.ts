import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingChannels } from '@memoflow/contracts/electron';

/**
 * Setting IPC adapter surface (stage-6 residual):
 * Invokes contracts SettingChannels only — no string-template dual-track channel names.
 */
describe('SettingIpcAdapter channel surface', () => {
  const source = readFileSync(resolve(__dirname, 'setting-ipc.adapter.ts'), 'utf8');

  it('invokes SettingChannels and does not hardcode setting: channel strings', () => {
    expect(source).toContain("import { SettingChannels } from '@memoflow/contracts/electron'");
    expect(source).toContain('SettingChannels.GET_ALL');
    expect(source).toContain('SettingChannels.PATCH');
    expect(source).toContain('SettingChannels.RESET');
    expect(source).toContain('SettingChannels.IMPORT');
    expect(source).toContain('SettingChannels.EXPORT');
    expect(source).toContain('SettingChannels.PREFERENCES_PROFILE_GET');
    expect(source).toContain('SettingChannels.PREFERENCE_GET');
    expect(source).toContain('SettingChannels.PREFERENCE_PATCH');
    expect(source).toContain('SettingChannels.PREFERENCE_RESET');
    expect(source).toContain('SettingChannels.PREFERENCES_RESET');
    expect(source).not.toMatch(/\$\{this\.channel\}/);
    expect(source).not.toContain("private readonly channel = 'setting'");
  });

  it('keeps live SettingChannels names stable', () => {
    expect(Object.values(SettingChannels)).toEqual([
      'setting:all',
      'setting:defaults',
      'setting:patch',
      'setting:reset',
      'setting:import',
      'setting:export',
      'setting:preferences:profile',
      'setting:preferences:reset',
      'setting:preference:get',
      'setting:preference:patch',
      'setting:preference:reset',
    ]);
  });
});
