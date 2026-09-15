import { describe, expect, it, vi } from 'vitest';
import { PortableAccountProfileV3Schema } from '@memoflow/contracts/account';
import { PreferencePortablePayloadV3Schema } from '@memoflow/contracts/setting';
import type { PortableCapabilityExecutionContext } from '@memoflow/contracts/data-portability';
import type { Instant } from '@memoflow/contracts/primitives';
import { createTimeContext, type Clock, type UserTimeContextPort } from '@memoflow/time';
import { Account } from '../domain/aggregates/account';
import type { IAccountRepository } from '../domain/repositories/i-account-repository';
import { AccountProfilePortableCapability } from './account-portability';

const identityId = 'identity-portability-test';
const now = 1_789_000_000_000 as Instant;
const clock: Clock = { now: () => now };
const context = {
  identityId,
  references: {} as PortableCapabilityExecutionContext['references'],
} satisfies PortableCapabilityExecutionContext;

const importedPreferences = PreferencePortablePayloadV3Schema.parse({
  presentation: { theme: 'light', language: 'en-US' },
  regional: { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: '24h', weekStartsOn: 1 },
});

function createFixture() {
  const account = Account.create({
    id: identityId as never,
    nicknameSeed: 'Existing User',
    now: (now - 1000) as Instant,
  });
  const save = vi.fn(async () => undefined);
  const userTimeContextPort: UserTimeContextPort = {
    getUserTimeContext: vi.fn(async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 })),
  };
  const repository: IAccountRepository = {
    save,
    findById: vi.fn(async (id: string) => (id === identityId ? account : null)),
    delete: vi.fn(async () => undefined),
    findAll: vi.fn(async () => ({ accounts: [account], total: 1 })),
  };
  return {
    account,
    save,
    userTimeContextPort,
    capability: new AccountProfilePortableCapability(repository, clock, userTimeContextPort),
  };
}

const target = PortableAccountProfileV3Schema.parse({
  nickname: 'Portable User',
  realName: 'Portable Real Name',
  avatarUrl: 'https://example.com/avatar.png',
  bio: 'Portable profile',
  gender: 'Other',
  birthday: '2000-02-29',
});

describe('AccountProfilePortableCapability', () => {
  it('exports only user-owned profile facts without host identity', async () => {
    const { capability } = createFixture();

    const payload = await capability.export(context);

    expect(payload).toEqual({
      nickname: 'Existing User',
      realName: null,
      avatarUrl: null,
      bio: null,
      gender: 'PreferNotToSay',
      birthday: null,
    });
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('identityId');
    expect(payload).not.toHaveProperty('status');
  });

  it('dry-runs and applies the complete profile onto the existing host account', async () => {
    const { account, capability, save } = createFixture();

    await expect(capability.dryRun(target, context)).resolves.toEqual({
      created: 0,
      updated: 1,
      skipped: 0,
      warnings: [],
    });

    await expect(capability.apply(target, context)).resolves.toEqual({
      created: 0,
      updated: 1,
      skipped: 0,
      warnings: [],
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(account.profile.toDTO()).toEqual(target);

    await expect(capability.apply(target, context)).resolves.toEqual({
      created: 0,
      updated: 0,
      skipped: 1,
      warnings: [],
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid avatars and future birthdays before saving', async () => {
    const { capability, save } = createFixture();
    const invalidAvatar = { ...target, avatarUrl: 'not-a-url' };
    const futureBirthday = { ...target, birthday: '2026-09-11' };

    await expect(capability.dryRun(invalidAvatar as never, context)).rejects.toThrow();
    await expect(capability.apply(invalidAvatar as never, context)).rejects.toThrow();
    await expect(capability.dryRun(futureBirthday, context)).rejects.toThrow(
      'Birthday cannot be in the future',
    );
    await expect(capability.apply(futureBirthday, context)).rejects.toThrow(
      'Birthday cannot be in the future',
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('uses the imported preferences time zone for dry-run and apply birthday validation', async () => {
    const { capability, userTimeContextPort } = createFixture();
    const hostTimeContext = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
    vi.mocked(userTimeContextPort.getUserTimeContext).mockResolvedValue(hostTimeContext);
    const importContext = {
      ...context,
      importedCapabilityPayloads: new Map<string, unknown>([['preferences', importedPreferences]]),
    } satisfies PortableCapabilityExecutionContext;
    const localToday = { ...target, birthday: '2026-09-10' };

    await expect(capability.dryRun(localToday, importContext)).resolves.toMatchObject({
      updated: 1,
    });
    await expect(capability.apply(localToday, importContext)).resolves.toMatchObject({
      updated: 1,
    });
    expect(userTimeContextPort.getUserTimeContext).not.toHaveBeenCalled();
  });

  it('declares preferences as an explicit portability dependency', () => {
    const { capability } = createFixture();

    expect(capability.dependsOn).toEqual(['preferences']);
  });

  it('validates the host account and birthday before the preferences dependency applies', async () => {
    const { capability, save } = createFixture();
    const invalidContext = {
      ...context,
      importedCapabilityPayloads: new Map<string, unknown>([['preferences', importedPreferences]]),
    } satisfies PortableCapabilityExecutionContext;
    const futureBirthday = { ...target, birthday: '2026-09-11' };

    await expect(capability.validateImport(futureBirthday, invalidContext)).rejects.toThrow(
      'Birthday cannot be in the future',
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('fails closed instead of creating a host account during import', async () => {
    const repository: IAccountRepository = {
      save: vi.fn(async () => undefined),
      findById: vi.fn(async () => null),
      delete: vi.fn(async () => undefined),
      findAll: vi.fn(async () => ({ accounts: [], total: 0 })),
    };
    const capability = new AccountProfilePortableCapability(repository, clock, {
      getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
    });

    await expect(capability.validateImport(target, context)).rejects.toThrow(
      'requires an existing host account',
    );
    await expect(capability.apply(target, context)).rejects.toThrow(
      'requires an existing host account',
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
});
