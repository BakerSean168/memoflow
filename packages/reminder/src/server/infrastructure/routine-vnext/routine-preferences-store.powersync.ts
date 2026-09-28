import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { RoutinePreferencesStore } from '../../domain/ports';
import { RoutinePreferences } from '../../domain/routine';

interface RoutinePreferencesPowerSyncRow {
  id: string;
  identity_id: string;
  global_enabled: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export class PowerSyncRoutinePreferencesStore implements RoutinePreferencesStore {
  constructor(private readonly db: IElectronDatabase) {}

  async find(input: { readonly identityId: string }): Promise<RoutinePreferences | null> {
    const row = await this.db.getOptional<RoutinePreferencesPowerSyncRow>(
      `SELECT id, identity_id, global_enabled, version, created_at, updated_at
       FROM routine_preferences
       WHERE identity_id = ?
       LIMIT 1`,
      [input.identityId],
    );
    return row
      ? RoutinePreferences.load({
          id: row.id,
          identityId: row.identity_id,
          globalEnabled: row.global_enabled === 1,
          version: row.version,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        })
      : null;
  }

  async create(input: { readonly preferences: RoutinePreferences }): Promise<void> {
    const state = input.preferences.snapshot();
    await this.db.execute(
      `INSERT INTO routine_preferences (
        id, identity_id, global_enabled, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        state.id,
        state.identityId,
        state.globalEnabled ? 1 : 0,
        state.version,
        state.createdAt.toISOString(),
        state.updatedAt.toISOString(),
      ],
    );
  }

  async update(input: {
    readonly preferences: RoutinePreferences;
    readonly expectedVersion: number;
  }): Promise<void> {
    const state = input.preferences.snapshot();
    const result = await this.db.execute(
      `UPDATE routine_preferences
       SET global_enabled = ?, version = ?, updated_at = ?
       WHERE identity_id = ? AND version = ?`,
      [
        state.globalEnabled ? 1 : 0,
        state.version,
        state.updatedAt.toISOString(),
        state.identityId,
        input.expectedVersion,
      ],
    );
    if (result.rowsAffected !== 1) {
      throw new Error('Routine preferences version conflict');
    }
  }
}
