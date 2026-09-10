import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@memoflow/database';
import { getDefaultPreferences } from '@memoflow/contracts/setting';
import { UserSettingPrismaRepository } from '../../../../infrastructure/adapters/prisma/user-setting-prisma.repository';
import { ResetUserSetting } from '../reset-user-setting';
import { cleanAllTables } from '@memoflow/test-utils/setup/database';

/**
 * W6-B real-database evidence: a brand-new user with no setting records can
 * run a full reset and receives the materialized default aggregate (full
 * preference tree), not an empty object — persisted through real Postgres.
 */

async function seedAccount() {
  const identityId = randomUUID();
  await prisma.cloudAuthUser.create({
    data: {
      id: identityId,
      email: `set-${identityId}@example.test`,
      name: 'Settings User',
      emailVerified: true,
    },
  });
  await prisma.account.create({
    data: {
      id: identityId,
      status: 'Active',
      profile: {},
    },
  });
  return identityId;
}

describe('ResetUserSetting no-record materialize (W6-B real DB)', () => {
  afterAll(async () => {
    await cleanAllTables(prisma);
    await prisma.$disconnect();
  });

  it('a new user with no setting record gets the full default aggregate on reset', async () => {
    const identityId = await seedAccount();

    const before = await prisma.userSetting.findUnique({ where: { identityId } });
    expect(before).toBeNull();

    const useCase = new ResetUserSetting(new UserSettingPrismaRepository(prisma));
    const result = await useCase.execute(identityId);

    const defaults = getDefaultPreferences();
    expect(result.preferences).toEqual(defaults);
    expect(Object.keys(result.preferences).length).toBeGreaterThan(0);
    expect(result.identityId).toBe(identityId);

    // The aggregate was materialized and persisted; a later reset keeps defaults.
    const row = await prisma.userSetting.findUnique({ where: { identityId } });
    expect(row).not.toBeNull();
    expect(
      typeof row!.preferences === 'string'
        ? JSON.parse(row!.preferences as string)
        : row!.preferences,
    ).toEqual(defaults);

    const again = await useCase.execute(identityId);
    expect(again.preferences).toEqual(defaults);
  });

  it('resetting a category for a no-record user returns the default aggregate', async () => {
    const identityId = await seedAccount();

    const useCase = new ResetUserSetting(new UserSettingPrismaRepository(prisma));
    const result = await useCase.execute(identityId, 'appearance');

    const defaults = getDefaultPreferences();
    expect(result.preferences.appearance).toEqual(defaults.appearance);
    expect(result.preferences.locale).toEqual(defaults.locale);
  });
});
