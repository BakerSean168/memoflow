/**
 * Setting Module - Mock Generators
 */

import { faker } from '@faker-js/faker';
import type { UserSettingClientDTO } from '../modules/setting/aggregates/user-setting-client';
import type { SettingId, IdentityId } from '../primitives/ids';

export function createMockUserSetting(
  overrides: Partial<UserSettingClientDTO> = {},
): UserSettingClientDTO {
  const now = Date.now();
  const id = faker.string.uuid();

  return {
    id: id as SettingId,
    identityId: faker.string.uuid() as IdentityId,
    preferences: {
      appearance: {
        theme: faker.helpers.arrayElement(['light', 'dark', 'auto']),
      },
      locale: {
        language: faker.helpers.arrayElement(['zh-CN', 'en-US', 'ja-JP']),
        timezone: faker.helpers.arrayElement([
          'Asia/Shanghai',
          'America/New_York',
          'Europe/London',
        ]),
        dateFormat: faker.helpers.arrayElement(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY']),
        timeFormat: faker.helpers.arrayElement(['12H', '24H']),
        weekStartsOn: faker.helpers.arrayElement([0, 1]),
      },
    },
    version: 1,
    createdAt: now - faker.number.int({ min: 0, max: 365 * 24 * 60 * 60 * 1000 }),
    updatedAt: now,
    ...overrides,
  };
}
