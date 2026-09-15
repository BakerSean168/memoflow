import { describe, expect, it } from 'vitest';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import { createActiveUsageTrigger, createWallClockTrigger } from '../../domain/routine';
import { serializeRoutineTrigger } from './trigger-persistence-parity';
import { loadPowerSyncRoutineLocalRegistrations } from './routine-local-registrations.powersync';

class FakeDb implements IElectronDatabase {
  constructor(
    private readonly definitions: Record<string, unknown>[],
    private readonly memberships: Record<string, unknown>[],
  ) {}

  async getAll<T>(sql: string): Promise<T[]> {
    if (sql.includes('FROM routine_definitions')) return this.definitions as T[];
    if (sql.includes('FROM routine_profile_memberships')) return this.memberships as T[];
    throw new Error(`Unexpected SQL: ${sql}`);
  }

  async getOptional<T>(): Promise<T | null> {
    return null;
  }

  async get<T>(): Promise<T> {
    throw new Error('not used');
  }

  async execute(): Promise<IElectronDatabaseQueryResult> {
    return { rowsAffected: 0 };
  }

  async writeTransaction<T>(
    callback: (tx: IElectronDatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return callback(this);
  }
}

const activeTrigger = createActiveUsageTrigger({
  requiredActiveMs: 40 * 60_000,
  naturalBreakCredit: { idleDurationMs: 5 * 60_000 },
  protocolBreakCredit: { kind: 'Stand', minimumBreakMs: 5 * 60_000 },
});

describe('PowerSync Routine local registration projection', () => {
  it('loads ActiveUsage semantics and explicit protocol-break capability without name heuristics', async () => {
    const db = new FakeDb(
      [
        {
          id: 'opaque-routine-id',
          identity_id: 'identity-1',
          enabled: 1,
          trigger_json: serializeRoutineTrigger(activeTrigger),
        },
        {
          id: 'wall-clock',
          identity_id: 'identity-1',
          enabled: 1,
          trigger_json: serializeRoutineTrigger(
            createWallClockTrigger({
              localTime: '09:00',
              timeZone: 'Asia/Shanghai',
              recurrence: { startDate: '2026-08-28', frequency: 'daily' },
            }),
          ),
        },
      ],
      [],
    );

    await expect(loadPowerSyncRoutineLocalRegistrations(db, 'identity-1', { activeProfileIds: ['profile-1'] })).resolves.toEqual({
      activeUsage: [
        {
          identityId: 'identity-1',
          routineId: 'opaque-routine-id',
          trigger: activeTrigger,
          gates: { routineEnabled: true },
        },
      ],
      protocolBreakCredits: [
        {
          identityId: 'identity-1',
          routineId: 'opaque-routine-id',
          kind: 'Stand',
          minimumBreakMs: 5 * 60_000,
        },
      ],
    });
  });

  it('collapses M:N profile gates only when one complete membership path is enabled', async () => {
    const db = new FakeDb(
      [
        {
          id: 'eyes',
          identity_id: 'identity-1',
          enabled: 1,
          trigger_json: serializeRoutineTrigger(
            createActiveUsageTrigger({ requiredActiveMs: 20 * 60_000 }),
          ),
        },
      ],
      [
        {
          routine_id: 'eyes',
          profile_id: 'profile-1',
          membership_enabled: 1,
          profile_enabled: 1,
        },
        {
          routine_id: 'eyes',
          membership_enabled: 0,
          profile_enabled: 1,
        },
      ],
    );

    const blocked = await loadPowerSyncRoutineLocalRegistrations(db, 'identity-1', { activeProfileIds: ['profile-1'] });
    expect(blocked.activeUsage[0]?.gates).toEqual({
      routineEnabled: true,
      profileEnabled: false,
      membershipEnabled: false,
    });

    const enabledDb = new FakeDb(
      [
        {
          id: 'eyes',
          identity_id: 'identity-1',
          enabled: 1,
          trigger_json: serializeRoutineTrigger(
            createActiveUsageTrigger({ requiredActiveMs: 20 * 60_000 }),
          ),
        },
      ],
      [
        ...db['memberships'],
        {
          routine_id: 'eyes',
          profile_id: 'profile-1',
          membership_enabled: 1,
          profile_enabled: 1,
        },
      ],
    );
    expect(
      (await loadPowerSyncRoutineLocalRegistrations(enabledDb, 'identity-1', { activeProfileIds: ['profile-1'] })).activeUsage[0]?.gates,
    ).toEqual({
      routineEnabled: true,
      profileEnabled: true,
      membershipEnabled: true,
    });
  });

  it('keeps legacy ActiveUsage trigger JSON compatible when protocolBreakCredit is absent', async () => {
    const legacyJson = JSON.stringify({
      type: 'ActiveUsage',
      timingOwner: 'local-runtime',
      requiredActiveMs: 1_000,
      anchor: 'last-satisfied',
      naturalBreakCredit: null,
    });
    const snapshot = await loadPowerSyncRoutineLocalRegistrations(
      new FakeDb(
        [{ id: 'legacy', identity_id: 'identity-1', enabled: 1, trigger_json: legacyJson }],
        [],
      ),
      'identity-1',
    );
    expect(snapshot.activeUsage[0]?.trigger.protocolBreakCredit).toBeNull();
    expect(snapshot.protocolBreakCredits).toEqual([]);
  });
});
