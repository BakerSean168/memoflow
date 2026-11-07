import type { UpdateAccountReq, UpdateAccountRes } from '@memoflow/account-contracts';
import { UpdateAccountSchema } from '@memoflow/account-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import { fail } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { createLogger } from '@memoflow/utils/logger';
import { formatZodErrors } from '@memoflow/utils/result';
import type { UpdateAccountProfileUseCase } from '../server/application';
import type { IAccountRepository } from '../server/domain';
import type { Transactional } from '../server/infrastructure';

const logger = createLogger('DesktopAccountProfileSync');

interface PendingProfileSyncRow {
  owner_id: string;
  revision: number;
}

interface ProfileSyncSnapshotRow {
  owner_id: string;
  nickname: string | null;
  bio: string | null;
  avatar_url: string | null;
  synced_at: number | null;
}

export type ProfileSyncFailureCategory =
  | 'authorization'
  | 'validation'
  | 'server'
  | 'network'
  | 'unknown';

export interface PendingProfileSyncField {
  readonly field: 'nickname' | 'bio';
  readonly value: string;
}

/** Renderer-safe projection of the profile delivery intent. */
export interface PendingProfileSyncState {
  readonly pending: boolean;
  readonly revision: number | null;
  readonly lastSyncedAt: number | null;
  readonly fields: readonly PendingProfileSyncField[];
  readonly failureCategory: ProfileSyncFailureCategory | null;
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
  private readonly stateListeners = new Set<() => void>();
  private lastFailureCategory: ProfileSyncFailureCategory | null = null;

  constructor(
    private readonly db: Transactional,
    private readonly repository: IAccountRepository,
    private readonly updateProfileUseCase: UpdateAccountProfileUseCase,
    private readonly options: DesktopAccountProfileSyncOptions,
  ) {}

  /** Notify the shell when the delivery intent or failure category changes. */
  subscribe(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private notifyStateChanged(): void {
    for (const listener of this.stateListeners) {
      try {
        listener();
      } catch (error: unknown) {
        logger.warn('Account profile sync state listener failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async update(input: unknown, cx: ExecutionContext): Promise<Result<UpdateAccountRes>> {
    const parsed = UpdateAccountSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }

    const cloudAccountId = this.options.getCloudAccountId();
    // Baseline for the field-level diff before the first successful flush.
    // The outbox only stores a revision, so the pre-edit profile is the only
    // field-level record of what the server last knew for this device.
    const priorAccount =
      cloudAccountId === cx.identityId
        ? await Promise.resolve(this.repository.findById(cx.identityId)).catch(() => null)
        : null;

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
      if (priorAccount) {
        await tx.execute(
          `INSERT OR IGNORE INTO account_profile_sync_snapshot
             (id, owner_id, nickname, bio, avatar_url, synced_at)
           VALUES ('current', ?, ?, ?, ?, NULL)`,
          [
            cx.identityId,
            priorAccount.profile.nickname,
            priorAccount.profile.bio || null,
            priorAccount.profile.avatarUrl || null,
          ],
        );
      }
      return updated;
    });

    if (result.ok) {
      this.notifyStateChanged();
      // The local transaction is the save. Everything after it (local display
      // metadata, cloud delivery) is best effort: a failure is logged and only
      // affects the sync state, never the returned Result or the committed row.
      await this.runAfterCommit('metadata update', () =>
        this.options.updateLocalProfileMetadata?.(parsed.data),
      );
      void this.flush().catch((error: unknown) => {
        logger.warn('Account profile flush after save failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    return result;
  }

  /** Run a post-commit step, swallowing and logging its failure. */
  private async runAfterCommit(
    label: string,
    step: () => Promise<void> | undefined,
  ): Promise<void> {
    try {
      await step();
    } catch (error: unknown) {
      logger.warn(`Account profile ${label} failed after commit`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    try {
      await this.options.pushCloudProfile(token, {
        nickname: account.profile.nickname,
        avatar: account.profile.avatarUrl || null,
        bio: account.profile.bio || null,
      });
    } catch (error: unknown) {
      this.lastFailureCategory = classifyProfileSyncFailure(error);
      this.notifyStateChanged();
      throw error;
    }
    await this.db.execute(
      `INSERT INTO account_profile_sync_snapshot
         (id, owner_id, nickname, bio, avatar_url, synced_at)
       VALUES ('current', ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         owner_id = excluded.owner_id,
         nickname = excluded.nickname,
         bio = excluded.bio,
         avatar_url = excluded.avatar_url,
         synced_at = excluded.synced_at`,
      [
        pending.owner_id,
        account.profile.nickname,
        account.profile.bio || null,
        account.profile.avatarUrl || null,
        Date.now(),
      ],
    );
    await this.db.execute(
      `DELETE FROM account_profile_sync_outbox
       WHERE id = 'current' AND revision = ?`,
      [pending.revision],
    );
    this.lastFailureCategory = null;
    this.notifyStateChanged();
    return true;
  }

  /**
   * Field-level pending projection for the sync indicator.
   *
   * Avatar delivery is not diffed here: Issue #859 tracks the local avatar file
   * and cloud meta timestamps in the renderer. `avatar_url` is stored in the
   * snapshot for completeness only.
   */
  async getState(): Promise<PendingProfileSyncState> {
    const [pending, snapshot] = await Promise.all([
      this.db.getOptional<PendingProfileSyncRow>(
        `SELECT owner_id, revision
         FROM account_profile_sync_outbox
         WHERE id = 'current'
         LIMIT 1`,
      ),
      this.db.getOptional<ProfileSyncSnapshotRow>(
        `SELECT owner_id, nickname, bio, avatar_url, synced_at
         FROM account_profile_sync_snapshot
         WHERE id = 'current'
         LIMIT 1`,
      ),
    ]);

    const lastSyncedAt =
      typeof snapshot?.synced_at === 'number' && Number.isFinite(snapshot.synced_at)
        ? snapshot.synced_at
        : null;
    if (!pending || this.options.getCloudAccountId() !== pending.owner_id) {
      return {
        pending: false,
        revision: null,
        lastSyncedAt,
        fields: [],
        failureCategory: this.lastFailureCategory,
      };
    }

    const account = await this.repository.findById(pending.owner_id);
    const fields: PendingProfileSyncField[] = [];
    if (account) {
      if (snapshot?.nickname !== account.profile.nickname) {
        fields.push({ field: 'nickname', value: account.profile.nickname });
      }
      if ((snapshot?.bio ?? null) !== (account.profile.bio || null)) {
        fields.push({ field: 'bio', value: account.profile.bio || '' });
      }
    }

    return {
      pending: true,
      revision: pending.revision,
      lastSyncedAt,
      fields,
      failureCategory: this.lastFailureCategory,
    };
  }
}

function classifyProfileSyncFailure(error: unknown): ProfileSyncFailureCategory {
  if (!error || typeof error !== 'object') return 'unknown';
  const candidate = error as {
    statusCode?: unknown;
    code?: unknown;
    name?: unknown;
  };
  if (typeof candidate.statusCode === 'number' && Number.isInteger(candidate.statusCode)) {
    if (candidate.statusCode === 401 || candidate.statusCode === 403) return 'authorization';
    if (
      candidate.statusCode === 400 ||
      candidate.statusCode === 409 ||
      candidate.statusCode === 422
    )
      return 'validation';
    if (candidate.statusCode >= 500 && candidate.statusCode <= 599) return 'server';
  }
  if (typeof candidate.code === 'string') {
    if (/REAUTH|UNAUTHOR|FORBIDDEN|AUTH/i.test(candidate.code)) return 'authorization';
    if (/VALIDATION/i.test(candidate.code)) return 'validation';
  }
  const name = typeof candidate.name === 'string' ? candidate.name : '';
  if (/Network|Fetch|Abort|Timeout|TypeError/i.test(name)) return 'network';
  return 'unknown';
}
