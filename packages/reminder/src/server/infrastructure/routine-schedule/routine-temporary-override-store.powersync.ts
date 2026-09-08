import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { RoutineTemporaryOverride } from '../../domain/routine';
import type { RoutineTemporaryOverrideStore } from '../../domain/ports/routine-temporary-override-store.port';
import { serializeRoutineTemporaryOverride } from '../routine-vnext/trigger-persistence-parity';

/** PowerSync/local counterpart of the Prisma Routine temporary override store. */
export class PowerSyncRoutineTemporaryOverrideStore implements RoutineTemporaryOverrideStore {
  constructor(private readonly db: IElectronDatabase, private readonly now: () => Date = () => new Date()) {}

  async setRoutineTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly override: RoutineTemporaryOverride;
  }): Promise<void> {
    const overrideJson = serializeRoutineTemporaryOverride(input.override);
    if (overrideJson == null) throw new TypeError('Expected a non-null RoutineTemporaryOverride');
    const timestamp = this.now().toISOString();
    const existing = await this.db.getOptional<{ routine_id: string }>(
      `SELECT routine_id FROM routine_temporary_overrides
       WHERE identity_id = ? AND routine_id = ? LIMIT 1`,
      [input.identityId, input.routineId],
    );
    if (existing) {
      await this.db.execute(
        `UPDATE routine_temporary_overrides
         SET override_json = ?, updated_at = ?
         WHERE identity_id = ? AND routine_id = ?`,
        [overrideJson, timestamp, input.identityId, input.routineId],
      );
      return;
    }
    await this.db.execute(
      `INSERT INTO routine_temporary_overrides
        (identity_id, routine_id, override_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [input.identityId, input.routineId, overrideJson, timestamp, timestamp],
    );
  }

  async clearRoutineTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<void> {
    await this.db.execute(
      'DELETE FROM routine_temporary_overrides WHERE identity_id = ? AND routine_id = ?',
      [input.identityId, input.routineId],
    );
  }
}
