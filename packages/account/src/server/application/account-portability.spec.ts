import { describe, expect, it, vi } from 'vitest';
import { PortableAccountProfileV3Schema } from '@memoflow/contracts/account';
import type { PortableCapabilityExecutionContext } from '@memoflow/contracts/data-portability';
import type { Instant } from '@memoflow/contracts/primitives';
import type { Clock } from '@memoflow/time';
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

function createFixture() {
  const account = Account.create({
    id: identityId as never,
    nicknameSeed: 'Existing User',
    now: (now - 1000) as Instant,
  });
  const save = vi.fn(async () => undefined);
  const repository: IAccountRepository = {
    save,
    findById: vi.fn(async (id: string) => (id === identityId ? account : null)),
    delete: vi.fn(async () => undefined),
    findAll: vi.fn(async () => ({ accounts: [account], total: 1 })),
  };
  return { account, save, capability: new AccountProfilePortableCapability(repository, clock) };
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

  it('fails closed instead of creating a host account during import', async () => {
    const repository: IAccountRepository = {
      save: vi.fn(async () => undefined),
      findById: vi.fn(async () => null),
      delete: vi.fn(async () => undefined),
      findAll: vi.fn(async () => ({ accounts: [], total: 0 })),
    };
    const capability = new AccountProfilePortableCapability(repository, clock);

    await expect(capability.apply(target, context)).rejects.toThrow(
      'requires an existing host account',
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
});
