import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import { UserReminderPreferences } from '../../../domain/aggregates/user-reminder-preferences';
import { UserReminderPreferencePrismaRepository } from './user-reminder-preference-prisma.repository';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../__tests__/integration-helpers';

describe('UserReminderPreferencePrismaRepository integration', () => {
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanAll();
  });

  it('persists the global Reminder master gate across save and reload', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const repository = new UserReminderPreferencePrismaRepository(prisma);
    const preferences = UserReminderPreferences.create({ identityId });

    preferences.toggleGlobalReminderEnabled(false);
    await repository.save(preferences);

    const row = await prisma.userReminderPreference.findUniqueOrThrow({
      where: { identityId },
    });
    const reloaded = await repository.findByIdentityId(identityId);

    expect(row.globalReminderEnabled).toBe(false);
    expect(row).not.toHaveProperty('globalSmartFrequency');
    expect(reloaded?.globalReminderEnabled).toBe(false);
  });
});
