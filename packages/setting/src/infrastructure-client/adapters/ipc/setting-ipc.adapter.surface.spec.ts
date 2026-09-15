import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingChannels } from '@memoflow/contracts/electron';

describe('Setting IPC adapter canonical channel surface', () => {
  const source = readFileSync(resolve(__dirname, 'setting-ipc.adapter.ts'), 'utf8');

  it('uses only the seven canonical preference/portability channels', () => {
    expect(Object.values(SettingChannels)).toEqual([
      'setting:import',
      'setting:export',
      'setting:preferences:profile',
      'setting:preferences:reset',
      'setting:preference:get',
      'setting:preference:patch',
      'setting:preference:reset',
    ]);
    for (const key of [
      'PREFERENCES_PROFILE_GET',
      'PREFERENCES_RESET',
      'PREFERENCE_GET',
      'PREFERENCE_PATCH',
      'PREFERENCE_RESET',
      'IMPORT',
      'EXPORT',
    ]) expect(source).toContain(`SettingChannels.${key}`);
  });

  it('has no deleted giant-tree channels or hard-coded setting channel strings', () => {
    expect(source).not.toContain('SettingChannels.GET_ALL');
    expect(source).not.toContain('SettingChannels.GET_DEFAULTS');
    expect(source).not.toContain('SettingChannels.PATCH');
    expect(source).not.toContain('SettingChannels.RESET');
    expect(source).not.toMatch(/['\"]setting:(all|defaults|patch|reset)['\"]/);
  });
});
