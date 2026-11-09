import type { Account as PrismaAccount } from '@memoflow/database';
import type { AccountState } from '../../../../domain';
import { Account } from '../../../../domain';
import { IdentityId } from '@memoflow/utils/domain';
import {
  AccountProfile,
  AccountStatus,
  normalizeStoredAccountProfile,
} from '../../../../domain/value-objects';

/** Prisma Date/DateTime → Instant (epoch ms). Required fields never null. */
function requiredInstant(value: Date | string | number | null | undefined): number {
  if (value == null) throw new Error('Account timestamp is required');
  const n =
    value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(n)) throw new Error('Account timestamp must be a finite Instant');
  return n;
}

/** Prisma Date/DateTime → Instant | null. */
function optionalInstant(value: Date | string | number | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export class AccountPrismaMapper {
  static toDomain(row: PrismaAccount): Account {
    const profile = normalizeStoredAccountProfile(row.profile);

    const state: AccountState = {
      id: IdentityId.of(row.id),
      status: AccountStatus.of(row.status),
      profile: AccountProfile.create(profile),
      createdAt: requiredInstant(row.createdAt),
      updatedAt: requiredInstant(row.updatedAt),
      closedAt: optionalInstant(row.closedAt),
      avatarUpdatedAt: optionalInstant(row.avatarUpdatedAt),
    };
    return Account.load(state);
  }
}
