import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type {
  GoalSurfaceLeaseGrant,
  GoalSurfaceLeaseRequest,
  IGoalSurfaceLeaseRepository,
} from '../../../application/ports/goal-surface-lease.port';

interface LeaseRow {
  owner_token: string | null;
  fence: number;
  expires_at: number;
}

/**
 * Profile-local SQLite lease. This coordinates windows sharing this profile,
 * NOT remote devices; the Web PostgreSQL store handles cross-device Web tabs.
 * Keep the row even when released to preserve the monotone fencing generation.
 */
export class AiGoalSurfaceLeasePowerSyncRepository implements IGoalSurfaceLeaseRepository {
  private ensurePromise: Promise<void> | null = null;
  constructor(private readonly db: IElectronDatabase) {}

  private ensureTable(): Promise<void> {
    if (!this.ensurePromise) {
      this.ensurePromise = this.db
        .execute(
          `
        CREATE TABLE IF NOT EXISTS ai_goal_surface_leases (
          identity_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          owner_token TEXT,
          fence INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          PRIMARY KEY(identity_id, run_id)
        )
      `,
        )
        .then(() => undefined)
        .catch((error: unknown) => {
          this.ensurePromise = null;
          throw error;
        });
    }
    return this.ensurePromise;
  }

  async claim(
    input: GoalSurfaceLeaseRequest & { token: string },
  ): Promise<GoalSurfaceLeaseGrant | null> {
    await this.ensureTable();
    return this.db.writeTransaction(async (tx) => {
      const row = await tx.getOptional<LeaseRow>(
        'SELECT owner_token, fence, expires_at FROM ai_goal_surface_leases WHERE identity_id = ? AND run_id = ?',
        [input.identityId, input.runId],
      );
      if (row && row.owner_token !== null && row.expires_at > input.now) return null;
      const fence = row ? row.fence + 1 : 1;
      if (row) {
        await tx.execute(
          'UPDATE ai_goal_surface_leases SET owner_token = ?, fence = ?, expires_at = ? WHERE identity_id = ? AND run_id = ?',
          [input.token, fence, input.expiresAt, input.identityId, input.runId],
        );
      } else {
        await tx.execute(
          'INSERT INTO ai_goal_surface_leases (identity_id, run_id, owner_token, fence, expires_at) VALUES (?, ?, ?, ?, ?)',
          [input.identityId, input.runId, input.token, fence, input.expiresAt],
        );
      }
      return { token: input.token, fence, expiresAt: input.expiresAt };
    });
  }

  async renew(input: GoalSurfaceLeaseRequest & { token: string; fence: number }): Promise<boolean> {
    await this.ensureTable();
    const updated = await this.db.execute(
      `UPDATE ai_goal_surface_leases SET expires_at = ?
        WHERE identity_id = ? AND run_id = ? AND owner_token = ?
          AND fence = ? AND expires_at > ?`,
      [input.expiresAt, input.identityId, input.runId, input.token, input.fence, input.now],
    );
    return updated.rowsAffected === 1;
  }

  async release(input: {
    identityId: string;
    runId: string;
    token: string;
    fence: number;
    now: number;
  }): Promise<boolean> {
    await this.ensureTable();
    const updated = await this.db.execute(
      `UPDATE ai_goal_surface_leases SET owner_token = NULL, expires_at = ?
        WHERE identity_id = ? AND run_id = ? AND owner_token = ? AND fence = ?`,
      [input.now, input.identityId, input.runId, input.token, input.fence],
    );
    return updated.rowsAffected === 1;
  }
}
