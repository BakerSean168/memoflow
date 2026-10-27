import type { UpdateAccountReq, UpdateAccountRes } from '@memoflow/account-contracts';
import { UpdateAccountSchema } from '@memoflow/account-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import { fail } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { formatZodErrors } from '@memoflow/utils/result';
import type { UpdateAccountProfileUseCase } from '../server/application';
import type { IAccountRepository } from '../server/domain';
import type { Transactional } from '../server/infrastructure';

interface PendingProfileSyncRow {
  owner_id: string;
  revision: number;
}

export interface DesktopAccountProfileSyncOptions {
  getCloudAccountId(): string | null;
  getCloudAccessToken(): Promise<string | null>;
  pushCloudProfile(token: string, request: UpdateAccountReq): Promise<void>;
  updateLocalProfileMetadata?(request: UpdateAccountReq): Promise<void>;
  closeCloudAccount?(
    token: string,
    request: { reason: string },
  ): Promise<import('@memoflow/account-contracts').AccountClosureReceiptDTO>;
  /** Set the local closure-requested marker BEFORE the cloud close call (required, fail-closed). */
  markAccountClosing(): Promise<void>;
  /** Clear the marker when the cloud close FAILS (restore local access; no permanent lock). */
  clearAccountClosingMarker(identityId: string): Promise<void>;
  /** Called after the cloud close succeeds; must NOT reopen local new-work before profile teardown. */
  afterCloudAccountClosed(): Promise<void>;
}

export class DesktopAccountProfileSync {
  constructor(
    private readonly db: Transactional,
    private readonly repository: IAccountRepository,
    private readonly updateProfileUseCase: UpdateAccountProfileUseCase,
    private readonly options: DesktopAccountProfileSyncOptions,
  ) {}

  async update(input: unknown, cx: ExecutionContext): Promise<Result<UpdateAccountRes>> {
    const parsed = UpdateAccountSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }

    const result = await this.db.writeTransaction(async (tx) => {
      const updated = await this.updateProfileUseCase.execute(parsed.data, cx, tx);
      if (!updated.ok || this.options.getCloudAccountId() !== cx.identityId) {
        return updated;
      }

      await tx.execute(
        `INSERT INTO account_profile_sync_outbox (id, owner_id, revision, requested_at)
         VALUES ('current', ?, 1, ?)
         ON CONFLICT(id) DO UPDATE SET
           owner_id = excluded.owner_id,
           revision = account_profile_sync_outbox.revision + 1,
           requested_at = excluded.requested_at`,
        [cx.identityId, Date.now()],
      );
      return updated;
    });

    if (result.ok) {
      await this.options.updateLocalProfileMetadata?.(parsed.data);
      void this.flush().catch(() => undefined);
    }
    return result;
  }

  async flush(): Promise<boolean> {
    const pending = await this.db.getOptional<PendingProfileSyncRow>(
      `SELECT owner_id, revision
       FROM account_profile_sync_outbox
       WHERE id = 'current'
       LIMIT 1`,
    );
    if (!pending || this.options.getCloudAccountId() !== pending.owner_id) return false;

    const token = await this.options.getCloudAccessToken();
    if (!token) return false;

    const account = await this.repository.findById(pending.owner_id);
    if (!account) return false;
    await this.options.pushCloudProfile(token, {
      nickname: account.profile.nickname,
      avatar: account.profile.avatarUrl || null,
      bio: account.profile.bio || null,
    });
    await this.db.execute(
      `DELETE FROM account_profile_sync_outbox
       WHERE id = 'current' AND revision = ?`,
      [pending.revision],
    );
    return true;
  }
}
