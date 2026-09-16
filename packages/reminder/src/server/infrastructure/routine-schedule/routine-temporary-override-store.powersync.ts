import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { RoutineTemporaryOverride } from '../../domain/routine';
import type { RoutineTemporaryOverrideStore } from '../../domain/ports/routine-temporary-override-store.port';
import {
  deserializeRoutineTemporaryOverride,
  serializeRoutineTemporaryOverride,
} from '../routine-vnext/trigger-persistence-parity';

/** PowerSync/local counterpart of the Prisma Routine temporary override store. */
export class PowerSyncRoutineTemporaryOverrideStore implements RoutineTemporaryOverrideStore {
  constructor(private readonly db: IElectronDatabase, private readonly now: () => Date = () => new Date()) {}

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
    const overrideJson = serializeRoutineTemporaryOverride(input.override);
    if (overrideJson == null) throw new TypeError('Expected a non-null RoutineTemporaryOverride');
    const timestamp = this.now().toISOString();
    if (input.expectedVersion === undefined) {
      const existing = await this.db.getOptional<{ routine_id: string }>(
        `SELECT routine_id FROM routine_temporary_overrides
         WHERE identity_id = ? AND routine_id = ? LIMIT 1`,
        [input.identityId, input.routineId],
      );
      if (existing) {
        await this.db.execute(
          `UPDATE routine_temporary_overrides
           SET override_json = ?, version = version + 1, updated_at = ?
           WHERE identity_id = ? AND routine_id = ?`,
          [overrideJson, timestamp, input.identityId, input.routineId],
        );
        return;
      }
      await this.db.execute(
        `INSERT INTO routine_temporary_overrides
          (identity_id, routine_id, override_json, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [input.identityId, input.routineId, overrideJson, 1, timestamp, timestamp],
      );
      return;
    }
    const result = await this.db.execute(
      `UPDATE routine_temporary_overrides
       SET override_json = ?, version = version + 1, updated_at = ?
       WHERE identity_id = ? AND routine_id = ? AND version = ?`,
      [overrideJson, timestamp, input.identityId, input.routineId, input.expectedVersion],
    );
    if (result.rowsAffected !== 1) {
      throw new Error(`Routine override '${input.routineId}' version conflict`);
    }
  }

  async clearRoutineTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly expectedVersion?: number;
  }): Promise<void> {
    const result = await this.db.execute(
      `DELETE FROM routine_temporary_overrides
       WHERE identity_id = ? AND routine_id = ?${input.expectedVersion === undefined ? '' : ' AND version = ?'}`,
      input.expectedVersion === undefined
        ? [input.identityId, input.routineId]
        : [input.identityId, input.routineId, input.expectedVersion],
    );
    if (input.expectedVersion !== undefined && result.rowsAffected !== 1) {
      throw new Error(`Routine override '${input.routineId}' version conflict`);
    }
  }
}
