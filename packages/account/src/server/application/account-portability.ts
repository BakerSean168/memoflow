import type {
  PortableCapability,
  PortableCapabilityExecutionContext,
  PortableCapabilityReceipt,
} from '@memoflow/contracts/data-portability';
import {
  PortableAccountProfileV3Schema,
  type PortableAccountProfileV3,
} from '@memoflow/contracts/account';
import { PreferencePortablePayloadV3Schema } from '@memoflow/contracts/setting';
import {
  instantToYmdInTimeZone,
  type Clock,
  type TimeZoneId,
  type UserTimeContextPort,
} from '@memoflow/time';
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
  readonly dependsOn = ['preferences'] as const;
  readonly payloadSchema = PortableAccountProfileV3Schema;

  constructor(
    private readonly accountRepository: IAccountRepository,
    private readonly clock: Clock,
    private readonly userTimeContextPort: UserTimeContextPort,
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
    const { target } = await this.validateTarget(payload, context, this.clock.now());
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
    const now = this.clock.now();
    const account = await this.requireHostAccount(context.identityId);
    const { target, profile } = await this.validateTarget(payload, context, now);
    const current = PortableAccountProfileV3Schema.parse(account.profile.toDTO());
    if (profilesEqual(current, target)) {
      return { created: 0, updated: 0, skipped: 1, warnings: [] };
    }

    account.updateProfile(profile, now);
    await this.accountRepository.save(account);
    return { created: 0, updated: 1, skipped: 0, warnings: [] };
  }

  private async validateTarget(
    payload: PortableAccountProfileV3,
    context: PortableCapabilityExecutionContext,
    now: ReturnType<Clock['now']>,
  ): Promise<{ target: PortableAccountProfileV3; profile: AccountProfile }> {
    const target = PortableAccountProfileV3Schema.parse(payload);
    let profile = AccountProfile.create(target);
    if (target.birthday != null) {
      const timeZone = await this.resolveImportTimeZone(context);
      const today = instantToYmdInTimeZone(now, timeZone);
      profile = profile.setBirthday(target.birthday, today);
    }
    return { target, profile };
  }

  private async resolveImportTimeZone(
    context: PortableCapabilityExecutionContext,
  ): Promise<TimeZoneId> {
    const importedPreferences = context.importedCapabilityPayloads?.get('preferences');
    if (importedPreferences !== undefined) {
      const preferences = PreferencePortablePayloadV3Schema.parse(importedPreferences);
      return preferences.regional.timeZone;
    }
    const timeContext = await this.userTimeContextPort.getUserTimeContext(context.identityId);
    return timeContext.timeZone;
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
  userTimeContextPort: UserTimeContextPort,
): AccountProfilePortableCapability {
  return new AccountProfilePortableCapability(accountRepository, clock, userTimeContextPort);
}
