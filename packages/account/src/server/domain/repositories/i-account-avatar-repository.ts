/**
 * Cloud avatar blob store (Issue #859).
 *
 * Kept as its own port so the Account aggregate never loads image bytes on
 * ordinary profile reads. The API lane binds the Postgres adapter; hosts that
 * do not serve cloud avatars simply omit it.
 */

export interface AccountAvatarRecord {
  readonly bytes: Uint8Array;
  /** Server-side last-write-wins timestamp (epoch ms). */
  readonly updatedAt: number;
}

export interface IAccountAvatarRepository {
  find(accountId: string): Promise<AccountAvatarRecord | null>;
  upsert(accountId: string, bytes: Uint8Array, updatedAt: number): Promise<void>;
}
