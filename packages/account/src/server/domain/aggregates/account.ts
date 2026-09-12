import type { Instant } from '@memoflow/contracts/primitives';
/** Account Aggregate Root - Server-side implementation. */

import type { AccountClientDTO, AccountServerDTO } from '@memoflow/contracts/account';
import { AggregateRoot } from '@memoflow/utils/domain';

// IdentityId from shared primitives (cross-module shared type)
import { IdentityId } from '@memoflow/domain-shared/shared';

import { AccountProfile, AccountStatus } from '../value-objects';

import type { AccountEventMap } from '@memoflow/contracts/account';

/** Domain state interface for the Account aggregate */
export interface AccountState {
  id: IdentityId;
  profile: AccountProfile;
  status: AccountStatus;
  closedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

export class Account extends AggregateRoot<IdentityId> {
  private _props: AccountState;

  private constructor(state: AccountState) {
    super(state.id);
    this._props = state;
  }

  // ================= Getters =================

  get profile(): AccountProfile {
    return this._props.profile;
  }
  get status(): AccountStatus {
    return this._props.status;
  }
  get closedAt(): Instant | null {
    const v = this._props.closedAt;
    if (v == null) return null;
    return v as Instant;
  }
  get createdAt(): Instant {
    const v = this._props.createdAt;
    return v as Instant;
  }
  get updatedAt(): Instant {
    const v = this._props.updatedAt;
    return v as Instant;
  }

  // ================= Factory Methods =================

  public static create(params: { id: IdentityId; nicknameSeed: string; now: Instant }): Account {
    const now = params.now;
    const state: AccountState = {
      id: params.id,
      status: AccountStatus.Active,
      profile: AccountProfile.createDefault(params.nicknameSeed),
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };
    const account = new Account(state);

    account.addDomainEvent<AccountEventMap['account:created']>('account:created', {
      identityId: params.id,
      accountId: account.id,
      account: account.toServerDTO(),
    });

    return account;
  }

  public static load(state: AccountState): Account {
    return new Account(state);
  }

  // ================= Business Operations =================

  public updateProfile(profile: AccountProfile, now: Instant): void {
    this._props.profile = profile;
    this._props.updatedAt = now;

    this.addDomainEvent<AccountEventMap['account:profile-updated']>('account:profile-updated', {
      identityId: this.id,
      accountId: this.id,
      account: this.toServerDTO(),
      changes: ['profile'],
    });
  }

  public close(now: Instant): void {
    if (this._props.status === AccountStatus.Closed) {
      throw new Error('Account is already closed.');
    }

    this._props.status = AccountStatus.Closed;
    this._props.closedAt = now;
    this._props.updatedAt = now;

    this.addDomainEvent<AccountEventMap['account:closed']>('account:closed', {
      identityId: this.id,
      accountId: this.id,
      account: this.toServerDTO(),
      reason: 'User initiated closure',
      closedAt: now,
    });
  }

  // ================= Serialization =================

  public toServerDTO(): AccountServerDTO {
    return {
      id: this.id,
      status: this._props.status,
      profile: this._props.profile.toDTO(),
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
      closedAt: this._props.closedAt ? this._props.closedAt : null,
    };
  }

  public toClientDTO(): AccountClientDTO {
    return {
      id: this.id,
      status: this._props.status,
      profile: this._props.profile.toDTO(),
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
      closedAt: this._props.closedAt ? this._props.closedAt : null,
    };
  }
}
