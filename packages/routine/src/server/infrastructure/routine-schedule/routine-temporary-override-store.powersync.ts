import { randomUUID } from 'node:crypto';
import { withRoutineWriteTransaction } from '../routine-vnext/powersync-write-transaction';
import type { IElectronDatabaseTransaction } from '@memoflow/desktop-contracts';
import type { RoutineTemporaryOverride } from '../../domain/routine';
import type { RoutineTemporaryOverrideStore } from '../../domain/ports/routine-temporary-override-store.port';
import {
  deserializeRoutineTemporaryOverride,
  serializeRoutineTemporaryOverride,
} from '../routine-vnext/trigger-persistence-parity';

/** PowerSync/local counterpart of the Prisma Routine temporary override store. */
export class PowerSyncRoutineTemporaryOverrideStore implements RoutineTemporaryOverrideStore {
  constructor(
    private readonly db: IElectronDatabaseTransaction,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async findRoutineTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<RoutineTemporaryOverride | null> {
    const row = await this.db.getOptional<{ override_json: string }>(
      `SELECT override_json FROM routine_temporary_overrides
       WHERE identity_id = ? AND routine_id = ? LIMIT 1`,
      [input.identityId, input.routineId],
    );
    return row ? deserializeRoutineTemporaryOverride(row.override_json) : null;
  }

  async setRoutineTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly override: RoutineTemporaryOverride;
    readonly expectedVersion?: number;
  }): Promise<void> {
    return withRoutineWriteTransaction(this.db, async (tx) => {
      const overrideJson = serializeRoutineTemporaryOverride(input.override);
      if (overrideJson == null) throw new TypeError('Expected a non-null RoutineTemporaryOverride');
      const timestamp = this.now().toISOString();
      if (input.expectedVersion === undefined) {
        const existing = await tx.getOptional<{ routine_id: string }>(
          `SELECT routine_id FROM routine_temporary_overrides
         WHERE identity_id = ? AND routine_id = ? LIMIT 1`,
          [input.identityId, input.routineId],
        );
        if (existing) {
          await tx.execute(
            `UPDATE routine_temporary_overrides
           SET override_json = ?, version = version + 1, updated_at = ?
           WHERE identity_id = ? AND routine_id = ?`,
            [overrideJson, timestamp, input.identityId, input.routineId],
          );
          return;
        }
        await tx.execute(
          `INSERT INTO routine_temporary_overrides
          (identity_id, routine_id, override_json, version, created_at, updated_at, id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            input.identityId,
            input.routineId,
            overrideJson,
            1,
            timestamp,
            timestamp,
            `RoutineOverride_${randomUUID()}`,
          ],
        );
        return;
      }
      const { count } = await tx.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM routine_temporary_overrides WHERE identity_id = ? AND routine_id = ? AND version = ?`,
        [input.identityId, input.routineId, input.expectedVersion],
      );
      if (count !== 1) {
        throw new Error(`Routine override '${input.routineId}' version conflict`);
      }
      await tx.execute(
        `UPDATE routine_temporary_overrides
       SET override_json = ?, version = version + 1, updated_at = ?
       WHERE identity_id = ? AND routine_id = ? AND version = ?`,
        [overrideJson, timestamp, input.identityId, input.routineId, input.expectedVersion],
      );
    });
  }

  async clearRoutineTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly expectedVersion?: number;
  }): Promise<void> {
    return withRoutineWriteTransaction(this.db, async (tx) => {
      if (input.expectedVersion !== undefined) {
        const { count } = await tx.get<{ count: number }>(
          `SELECT COUNT(*) AS count FROM routine_temporary_overrides WHERE identity_id = ? AND routine_id = ?${input.expectedVersion === undefined ? '' : ' AND version = ?'}`,
          input.expectedVersion === undefined
            ? [input.identityId, input.routineId]
            : [input.identityId, input.routineId, input.expectedVersion],
        );
        if (count !== 1) {
          throw new Error(`Routine override '${input.routineId}' version conflict`);
        }
      }
      await tx.execute(
        `DELETE FROM routine_temporary_overrides
       WHERE identity_id = ? AND routine_id = ?${input.expectedVersion === undefined ? '' : ' AND version = ?'}`,
        input.expectedVersion === undefined
          ? [input.identityId, input.routineId]
          : [input.identityId, input.routineId, input.expectedVersion],
      );
    });
  }
}
