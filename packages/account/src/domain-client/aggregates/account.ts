import type { Instant } from '@memoflow/contracts/primitives';
/**
 * Account Aggregate Root - Domain Client
 *
 * Read-only client-side representation of the Account aggregate.
 */

import type { AccountClientDTO } from '@memoflow/contracts/account';
import { AggregateRoot } from '@memoflow/utils/domain';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { AccountProfile, AccountStatus } from '../../server/domain/value-objects';

export interface AccountState {
  id: IdentityId;
  profile: AccountProfile;
  status: AccountStatus;
  createdAt: Instant;
  updatedAt: Instant;
  closedAt: Instant | null;
}

export class Account extends AggregateRoot<IdentityId> {
  private readonly _props: AccountState;

  private constructor(props: AccountState) {
    super(props.id);
    this._props = props;
  }

  get profile(): AccountProfile {
    return this._props.profile;
  }
  get status(): AccountStatus {
    return this._props.status;
  }
  get createdAt(): Instant {
    const v = this._props.createdAt;
    return v as Instant;
  }
  get updatedAt(): Instant {
    const v = this._props.updatedAt;
    return v as Instant;
  }
  get closedAt(): Instant | null {
    const v = this._props.closedAt;
    if (v == null) return null;
    return v as Instant;
  }

  public static load(state: AccountState): Account {
    return new Account(state);
  }

  public toDTO(): AccountClientDTO {
    return {
      id: String(this.id) as AccountClientDTO['id'],
      status: this._props.status,
      profile: this._props.profile.toDTO(),
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
      closedAt: this._props.closedAt ?? null,
    };
  }
}
