import { describe, expect, it } from 'vitest';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import {
  createActiveUsageTrigger,
  createElapsedTrigger,
  createSnoozeOverride,
  createWallClockTrigger,
} from '../../domain/routine';
import {
  serializeRoutineTemporaryOverride,
  serializeRoutineTrigger,
} from './trigger-persistence-parity';
import { loadPowerSyncRoutineLocalRegistrations } from './routine-local-registrations.powersync';

class FakeDb implements IElectronDatabase {
  constructor(
    private readonly definitions: Record<string, unknown>[],
    private readonly memberships: Record<string, unknown>[],
    private readonly overrides: Record<string, unknown>[] = [],
  ) {}

  async getAll<T>(sql: string): Promise<T[]> {
    if (sql.includes('FROM routine_definitions')) return this.definitions as T[];
    if (sql.includes('FROM routine_profile_memberships')) return this.memberships as T[];
    if (sql.includes('FROM routine_temporary_overrides')) return this.overrides as T[];
    if (sql.includes('FROM routine_occurrences')) return [] as T[];
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
          version: 1,
          updated_at: '2026-09-17T00:00:00.000Z',
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
          version: 1,
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
      [],
    );

    await expect(
      loadPowerSyncRoutineLocalRegistrations(db, 'identity-1', { activeProfileIds: ['profile-1'] }),
    ).resolves.toEqual({
      elapsed: [],
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
          version: 1,
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
      [
        {
          routine_id: 'eyes',
          profile_id: 'profile-2',
          membership_enabled: 1,
          profile_enabled: 1,
        },
        {
          routine_id: 'eyes',
          profile_id: 'profile-1',
          membership_enabled: 0,
          profile_enabled: 1,
        },
      ],
    );

    const blocked = await loadPowerSyncRoutineLocalRegistrations(db, 'identity-1', {
      activeProfileIds: ['profile-1'],
    });
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
          version: 1,
          updated_at: '2026-09-17T00:00:00.000Z',
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
      (
        await loadPowerSyncRoutineLocalRegistrations(enabledDb, 'identity-1', {
          activeProfileIds: ['profile-1'],
        })
      ).activeUsage[0]?.gates,
    ).toEqual({
      routineEnabled: true,
      profileEnabled: true,
      membershipEnabled: true,
    });
  });

  it('projects a durable temporary override into ActiveUsage gates', async () => {
    const override = createSnoozeOverride({
      now: 1_000,
      durationMs: 300_000,
      source: 'user',
      reason: 'test snooze',
    });
    const db = new FakeDb(
      [
        {
          id: 'eyes',
          identity_id: 'identity-1',
          enabled: 1,
          trigger_json: serializeRoutineTrigger(
            createActiveUsageTrigger({ requiredActiveMs: 20 * 60_000 }),
          ),
          version: 1,
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
      [],
      [{ routine_id: 'eyes', override_json: serializeRoutineTemporaryOverride(override) }],
    );

    const snapshot = await loadPowerSyncRoutineLocalRegistrations(db, 'identity-1');
    expect(snapshot.activeUsage[0]?.gates).toEqual({
      routineEnabled: true,
      temporaryOverride: override,
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
        [{
          id: 'legacy', identity_id: 'identity-1', enabled: 1, trigger_json: legacyJson,
          version: 1, updated_at: '2026-09-17T00:00:00.000Z',
        }],
        [],
      ),
      'identity-1',
    );
    expect(snapshot.activeUsage[0]?.trigger.protocolBreakCredit).toBeNull();
    expect(snapshot.protocolBreakCredits).toEqual([]);
  });
  it('projects Elapsed durable anchors from definition revision or last satisfied occurrence', async () => {
    class ElapsedDb extends FakeDb {
      override async getAll<T>(sql: string): Promise<T[]> {
        if (sql.includes('FROM routine_occurrences')) {
          return [
            {
              routine_id: 'activation',
              occurrence_key: 'routine:activation:elapsed:definition-4:2',
              trigger_kind: 'Elapsed',
              source_revision: 'definition-4',
              became_due_at: '2026-09-17T01:32:00.000Z',
              resolution_state: 'Open',
              resolved_at: null,
            },
            {
              routine_id: 'last',
              occurrence_key: 'routine:last:elapsed:definition-7:1',
              trigger_kind: 'Elapsed',
              source_revision: 'definition-7',
              became_due_at: '2026-09-17T01:45:00.000Z',
              resolution_state: 'Satisfied',
              resolved_at: '2026-09-17T02:00:00.000Z',
            },
            {
              routine_id: 'last',
              occurrence_key: 'routine:last:elapsed:definition-7:0',
              trigger_kind: 'Elapsed',
              source_revision: 'definition-7',
              became_due_at: '2026-09-17T00:45:00.000Z',
              resolution_state: 'Satisfied',
              resolved_at: '2026-09-17T01:00:00.000Z',
            },
          ] as T[];
        }
        return super.getAll<T>(sql);
      }
    }
    const db = new ElapsedDb(
      [
        {
          id: 'activation', identity_id: 'identity-1', enabled: 1,
          trigger_json: serializeRoutineTrigger(createElapsedTrigger({
            durationMs: 60_000, anchor: 'routine-activation',
          })),
          version: 4, updated_at: '2026-09-17T00:30:00.000Z',
        },
        {
          id: 'last', identity_id: 'identity-1', enabled: 1,
          trigger_json: serializeRoutineTrigger(createElapsedTrigger({
            durationMs: 60_000, anchor: 'last-satisfied',
          })),
          version: 7, updated_at: '2026-09-17T00:45:00.000Z',
        },
        {
          id: 'profile', identity_id: 'identity-1', enabled: 1,
          trigger_json: serializeRoutineTrigger(createElapsedTrigger({
            durationMs: 60_000, anchor: 'profile-activation',
          })),
          version: 2, updated_at: '2026-09-17T00:50:00.000Z',
        },
      ],
      [],
    );

    const snapshot = await loadPowerSyncRoutineLocalRegistrations(db, 'identity-1', {
      activeProfileIds: [],
    });
    expect(snapshot.elapsed).toEqual([
      expect.objectContaining({
        routineId: 'activation',
        durableAnchorAt: Date.parse('2026-09-17T00:30:00.000Z'),
        durableAnchorRevision: 'definition-4',
        initialGeneration: 2,
      }),
      expect.objectContaining({
        routineId: 'last',
        durableAnchorAt: Date.parse('2026-09-17T02:00:00.000Z'),
        durableAnchorRevision: `satisfied-${Date.parse('2026-09-17T02:00:00.000Z')}`,
        initialGeneration: 1,
      }),
      expect.objectContaining({ routineId: 'profile' }),
    ]);
    expect(snapshot.elapsed[2]).not.toHaveProperty('durableAnchorAt');
    expect(snapshot.elapsed[2]).not.toHaveProperty('durableAnchorRevision');
    expect(snapshot.elapsed[2]).not.toHaveProperty('initialGeneration');
  });

  it('restores ActiveUsage generation from durable terminal/open occurrences after restart', async () => {
    class RestartDb extends FakeDb {
      override async getAll<T>(sql: string): Promise<T[]> {
        if (sql.includes('FROM routine_occurrences')) {
          return [
            {
              routine_id: 'active-open',
              occurrence_key: 'routine:active-open:active-usage:3',
              trigger_kind: 'ActiveUsage',
              source_revision: '3',
              resolution_state: 'Open',
              resolved_at: null,
              became_due_at: '2026-09-17T03:00:00.000Z',
            },
            {
              routine_id: 'active-open',
              occurrence_key: 'routine:active-open:active-usage:2',
              trigger_kind: 'ActiveUsage',
              source_revision: '2',
              resolution_state: 'Satisfied',
              resolved_at: '2026-09-17T02:00:00.000Z',
              became_due_at: '2026-09-17T01:59:00.000Z',
            },
            {
              routine_id: 'active-terminal',
              occurrence_key: 'routine:active-terminal:active-usage:4',
              trigger_kind: 'ActiveUsage',
              source_revision: '4',
              resolution_state: 'Satisfied',
              resolved_at: '2026-09-17T04:00:00.000Z',
              became_due_at: '2026-09-17T03:59:00.000Z',
            },
          ] as T[];
        }
        return super.getAll<T>(sql);
      }
    }
    const active = createActiveUsageTrigger({ requiredActiveMs: 20 * 60_000 });
    const db = new RestartDb(
      [
        {
          id: 'active-open', identity_id: 'identity-1', enabled: 1,
          trigger_json: serializeRoutineTrigger(active), version: 1,
          updated_at: '2026-09-17T00:00:00.000Z',
        },
        {
          id: 'active-terminal', identity_id: 'identity-1', enabled: 1,
          trigger_json: serializeRoutineTrigger(active), version: 1,
          updated_at: '2026-09-17T00:00:00.000Z',
        },
      ],
      [],
    );

    const snapshot = await loadPowerSyncRoutineLocalRegistrations(db, 'identity-1');
    expect(snapshot.activeUsage).toEqual([
      expect.objectContaining({
        routineId: 'active-open',
        restoredSnapshot: {
          identityId: 'identity-1',
          routineId: 'active-open',
          accumulatedActiveMs: 20 * 60_000,
          generation: 3,
          thresholdSignaled: false,
          lastSatisfiedAt: Date.parse('2026-09-17T02:00:00.000Z'),
        },
      }),
      expect.objectContaining({
        routineId: 'active-terminal',
        restoredSnapshot: {
          identityId: 'identity-1',
          routineId: 'active-terminal',
          accumulatedActiveMs: 0,
          generation: 5,
          thresholdSignaled: false,
          lastSatisfiedAt: Date.parse('2026-09-17T04:00:00.000Z'),
        },
      }),
    ]);
  });

});
