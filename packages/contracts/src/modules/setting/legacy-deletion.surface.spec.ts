import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingChannels } from '../../electron/ipc-channels';

const settingRoot = resolve(__dirname);
const repositoryRoot = resolve(settingRoot, '../../../../..');

function source(relative: string): string {
  return readFileSync(resolve(repositoryRoot, relative), 'utf8');
}

describe('SETTING-9209 canonical-only architecture lock', () => {
  it('keeps only the seven canonical Setting IPC channels', () => {
    expect(Object.values(SettingChannels)).toEqual([
      'setting:import',
      'setting:export',
      'setting:preferences:profile',
      'setting:preferences:reset',
      'setting:preference:get',
      'setting:preference:patch',
      'setting:preference:reset',
    ]);
  });

  it('does not restore legacy UserSetting contract directories or DTOs', () => {
    for (const relative of [
      'packages/contracts/src/modules/setting/aggregates',
      'packages/contracts/src/modules/setting/configs',
      'packages/contracts/src/modules/setting/dtos',
      'packages/contracts/src/modules/setting/value-objects',
      'packages/contracts/src/modules/setting/api/user-setting.dto.ts',
      'packages/contracts/src/modules/setting/preferences/types.ts',
      'packages/contracts/src/modules/setting/preferences/defaults.ts',
      'packages/contracts/src/modules/setting/preferences/schemas',
    ]) expect(existsSync(resolve(repositoryRoot, relative))).toBe(false);
  });

  it('keeps Setting contracts on canonical namespaces plus preferences@3 only', () => {
    const root = source('packages/contracts/src/modules/setting/index.ts');
    const preferences = source('packages/contracts/src/modules/setting/preferences/index.ts');
    const responses = source('packages/contracts/src/modules/setting/api/response-schemas.ts');
    expect(root).toContain("export * from './preferences'");
    expect(preferences).toContain("export * from './portable-v3'");
    expect(preferences).not.toContain('UserSettingPreferences');
    expect(responses).not.toContain('UserSettingResponseSchema');
  });

  it('keeps persistence source free of the deleted user_settings table', () => {
    const prisma = source('packages/database/prisma/schema/setting.prisma');
    const account = source('packages/database/prisma/schema/account.prisma');
    const powerSync = source('packages/powersync-schema/src/index.ts');
    expect(prisma).not.toContain('model UserSetting');
    expect(account).not.toContain('userSettings');
    expect(powerSync).not.toContain('user_settings');
    expect(prisma).toContain('model UserPreferenceRecord');
    expect(powerSync).toContain('user_preference_records');
  });
});
