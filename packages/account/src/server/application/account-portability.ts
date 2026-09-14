import type {
  PortableCapability,
  PortableCapabilityExecutionContext,
  PortableCapabilityReceipt,
} from '@memoflow/contracts/data-portability';
import {
  PortableAccountProfileV3Schema,
  type PortableAccountProfileV3,
} from '@memoflow/contracts/account';
import type { Clock } from '@memoflow/time';
import type { IAccountRepository } from '../domain/repositories/i-account-repository';
import { AccountProfile } from '../domain/value-objects/account-profile';

function profilesEqual(
  current: PortableAccountProfileV3,
  target: PortableAccountProfileV3,
): boolean {
  return (
    current.nickname === target.nickname &&
    current.realName === target.realName &&
    current.avatarUrl === target.avatarUrl &&
    current.bio === target.bio &&
    current.gender === target.gender &&
    current.birthday === target.birthday
  );
}

/** Account-owned V3 profile portability. Identity/account existence remains host-owned. */
export class AccountProfilePortableCapability implements PortableCapability<PortableAccountProfileV3> {
  readonly key = 'account-profile' as const;
  readonly schemaVersion = 3;
  readonly payloadSchema = PortableAccountProfileV3Schema;

  constructor(
    private readonly accountRepository: IAccountRepository,
    private readonly clock: Clock,
  ) {}

  async export(
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableAccountProfileV3 | null> {
    const account = await this.accountRepository.findById(context.identityId);
    if (!account) return null;
    return PortableAccountProfileV3Schema.parse(account.profile.toDTO());
  }

  async dryRun(
    payload: PortableAccountProfileV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const target = PortableAccountProfileV3Schema.parse(payload);
    const account = await this.requireHostAccount(context.identityId);
    const current = PortableAccountProfileV3Schema.parse(account.profile.toDTO());
    return profilesEqual(current, target)
      ? { created: 0, updated: 0, skipped: 1, warnings: [] }
      : { created: 0, updated: 1, skipped: 0, warnings: [] };
  }

  async apply(
    payload: PortableAccountProfileV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const target = PortableAccountProfileV3Schema.parse(payload);
    const account = await this.requireHostAccount(context.identityId);
    const current = PortableAccountProfileV3Schema.parse(account.profile.toDTO());
    if (profilesEqual(current, target)) {
      return { created: 0, updated: 0, skipped: 1, warnings: [] };
    }

    account.updateProfile(AccountProfile.create(target), this.clock.now());
    await this.accountRepository.save(account);
    return { created: 0, updated: 1, skipped: 0, warnings: [] };
  }

  private async requireHostAccount(identityId: string) {
    const account = await this.accountRepository.findById(identityId);
    if (!account) {
      throw new Error(
        'Account profile portability requires an existing host account; identity is not portable data',
      );
    }
    return account;
  }
}

export function createAccountProfilePortableCapability(
  accountRepository: IAccountRepository,
  clock: Clock,
): AccountProfilePortableCapability {
  return new AccountProfilePortableCapability(accountRepository, clock);
}
