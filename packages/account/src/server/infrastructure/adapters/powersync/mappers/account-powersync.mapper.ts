/**
 * Account PowerSync row mapper.
 * Residual 1081 keep-boundary: private static parseJson throws on invalid JSON
 * (required string columns). Intentionally not utils parseJson/parseJsonSafe
 * (null/undefined + fallback, never throw).
 * Soft residual 1091: api PowerSync parseJsonLikeString keep-boundary (no force-merge).
 * Soft residual 1095: data-portability parseJsonField keep-boundary (no force-merge).
 */
import type { AccountState } from '../../../../domain';
import { Account } from '../../../../domain';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { AccountProfile, AccountStatus } from '../../../../domain/value-objects';
import type { AccountProfileDTO } from '@memoflow/contracts/account';

export type PowerSyncAccountRow = {
  id: string;
  status: string;
  profile: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export class AccountPowerSyncMapper {
  static toDomain(row: PowerSyncAccountRow): Account {
    const profile = this.parseJson<AccountProfileDTO>(row.profile);

    const state: AccountState = {
      id: IdentityId.of(row.id),
      status: AccountStatus.of(row.status),
      profile: AccountProfile.create({
        nickname: profile.nickname,
        realName: profile.realName,
        avatarUrl: profile.avatarUrl,
        bio: profile.bio,
        gender: profile.gender,
        birthday: profile.birthday ?? null,
      }),
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      closedAt: row.closed_at ? new Date(row.closed_at).getTime() : null,
    };

    return Account.load(state);
  }

  static toRow(account: Account): PowerSyncAccountRow {
    const profile = account.profile.toDTO();

    return {
      id: account.id.toString(),
      status: account.status.toString(),
      profile: JSON.stringify(profile),
      created_at: new Date(account.createdAt).toISOString(),
      updated_at: new Date(account.updatedAt).toISOString(),
      closed_at: account.closedAt ? new Date(account.closedAt).toISOString() : null,
    };
  }

  // Residual 1081 keep-boundary: throw-on-invalid parse (no fallback dual).
  private static parseJson<T>(value: string): T {
    return JSON.parse(value) as T;
  }

  private static toBoolean(value: number | boolean | null | undefined): boolean {
    return value === true || value === 1;
  }

  private static toInteger(value: boolean): number {
    return value ? 1 : 0;
  }
}
