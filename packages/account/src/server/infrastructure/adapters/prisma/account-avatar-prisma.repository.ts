/**
 * Prisma-backed cloud avatar blob store (Issue #859).
 *
 * Bytes live in `account_avatars`; the account row keeps only the
 * last-write-wins timestamp (see `Account.avatarUpdatedAt`). Every operation is
 * scoped by the account id supplied by the authenticated caller, never by a
 * request body field.
 */

import type { PrismaClient } from '@memoflow/database';
import type {
  AccountAvatarRecord,
  IAccountAvatarRepository,
} from '../../../domain/repositories/i-account-avatar-repository';

/** Minimal DB capability: the avatar table alone. */
interface AccountAvatarDb {
  accountAvatar: Pick<PrismaClient['accountAvatar'], 'findUnique' | 'upsert'>;
}

export class PrismaAccountAvatarRepository implements IAccountAvatarRepository {
  constructor(private readonly db: AccountAvatarDb) {}

  async find(accountId: string): Promise<AccountAvatarRecord | null> {
    const row = await this.db.accountAvatar.findUnique({ where: { accountId } });
    if (!row) return null;
    return {
      bytes: new Uint8Array(row.contentBytes),
      updatedAt: row.updatedAt.getTime(),
    };
  }

  async upsert(accountId: string, bytes: Uint8Array, updatedAt: number): Promise<void> {
    const contentBytes = Buffer.from(bytes);
    await this.db.accountAvatar.upsert({
      where: { accountId },
      update: { contentBytes, byteSize: contentBytes.byteLength, updatedAt: new Date(updatedAt) },
      create: {
        accountId,
        contentBytes,
        byteSize: contentBytes.byteLength,
        updatedAt: new Date(updatedAt),
      },
    });
  }
}

export function createAccountAvatarPrismaRepository(
  db: PrismaClient,
): PrismaAccountAvatarRepository {
  return new PrismaAccountAvatarRepository(db);
}
