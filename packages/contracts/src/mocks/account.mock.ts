/**
 * Account Module - Mock Generators
 *
 * Provides factory functions for generating realistic mock data
 * that conforms to the Account module contracts.
 *
 * Usage:
 * ```ts
 * import { createMockAccount } from '@memoflow/contracts/mocks';
 * const account = createMockAccount();
 * ```
 */

import { faker } from '@faker-js/faker';
import type { AccountClientDTO } from '../modules/account/aggregates/account-client';
import type { IdentityId } from '../primitives/ids';

// ============================================================================
// AccountClientDTO
// ============================================================================

/**
 * Creates a single mock AccountClientDTO.
 * Pass overrides to customise specific fields.
 */
export function createMockAccount(overrides: Partial<AccountClientDTO> = {}): AccountClientDTO {
  const now = Date.now();

  return {
    id: faker.string.uuid() as IdentityId,
    status: 'Active',
    profile: {
      nickname: faker.internet.username(),
      realName: faker.datatype.boolean() ? faker.person.fullName() : null,
      avatarUrl: faker.datatype.boolean() ? faker.image.avatar() : null,
      bio: faker.datatype.boolean() ? faker.lorem.sentence() : null,
      gender: faker.helpers.arrayElement(['Male', 'Female', 'Other', 'PreferNotToSay'] as const),
      birthday: null,
    },
    createdAt: now - faker.number.int({ min: 0, max: 365 * 24 * 60 * 60 * 1000 }),
    updatedAt: now,
    closedAt: null,
    ...overrides,
  } as AccountClientDTO;
}
