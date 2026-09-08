import { describe, expect, it } from 'vitest';
import { createTemporaryOverride } from '../../domain/routine';
import { PowerSyncRoutineTemporaryOverrideStore } from './routine-temporary-override-store.powersync';

class FakeDb {
  row: { identity_id: string; routine_id: string; override_json: string; created_at: string; updated_at: string } | null = null;
  async getOptional<T>(_sql: string, params: unknown[]): Promise<T | null> {
    if (this.row && this.row.identity_id === params[0] && this.row.routine_id === params[1]) {
      return { routine_id: this.row.routine_id } as T;
    }
    return null;
  }
  async execute(sql: string, params: unknown[]) {
    if (sql.includes('INSERT INTO routine_temporary_overrides')) {
      this.row = {
        identity_id: String(params[0]),
        routine_id: String(params[1]),
        override_json: String(params[2]),
        created_at: String(params[3]),
        updated_at: String(params[4]),
      };
    } else if (sql.includes('UPDATE routine_temporary_overrides') && this.row) {
      this.row.override_json = String(params[0]);
      this.row.updated_at = String(params[1]);
    } else if (sql.includes('DELETE FROM routine_temporary_overrides')) {
      this.row = null;
    }
    return { rowsAffected: 1 };
  }
}

describe('PowerSyncRoutineTemporaryOverrideStore', () => {
  it('upserts one override row and can clear it', async () => {
    const db = new FakeDb();
    const store = new PowerSyncRoutineTemporaryOverrideStore(db as never, () => new Date('2026-09-08T00:00:00Z'));
    await store.setRoutineTemporaryOverride({
      identityId: 'i-1',
      routineId: 'r-1',
      override: createTemporaryOverride({
        suppressUntil: 2_000,
        expiresAt: 2_000,
        reason: 'focus',
        source: 'ai',
      }),
    });
    expect(db.row).toMatchObject({ identity_id: 'i-1', routine_id: 'r-1' });
    expect(JSON.parse(db.row!.override_json)).toMatchObject({ source: 'ai', suppressUntil: 2_000 });

    await store.clearRoutineTemporaryOverride({ identityId: 'i-1', routineId: 'r-1' });
    expect(db.row).toBeNull();
  });
});
