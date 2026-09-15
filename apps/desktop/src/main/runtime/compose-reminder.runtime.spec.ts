import { describe, expect, it, vi } from 'vitest';
import { asInstant, createTimeContext } from '@memoflow/time';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import type { NotificationRequestedWriterPort } from '@memoflow/notification';
import { createActiveUsageTrigger } from '@memoflow/reminder/server';
import type {
  IdleSensorPort,
  ProtocolBreakCompletionFact,
  UserIdleObserved,
  UserResumeObserved,
} from '@memoflow/reminder/routine-runtime';
import { composeReminder } from './compose-reminder';

class RoutineDb implements IElectronDatabase {
  constructor(private readonly triggerJson: string) {}

  async getAll<T>(sql: string): Promise<T[]> {
    if (sql.includes('FROM routine_definitions')) {
      return [
        {
          id: 'routine-opaque',
          identity_id: 'identity-1',
          enabled: 1,
          trigger_json: this.triggerJson,
        },
      ] as T[];
    }
    if (sql.includes('FROM routine_profile_memberships')) {
      return [
        {
          routine_id: 'routine-opaque',
          membership_enabled: 1,
          profile_enabled: 1,
          profile_active: 1,
        },
      ] as T[];
    }
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

class ControlledIdleSensor implements IdleSensorPort {
  private idleListener: ((event: UserIdleObserved) => void) | null = null;
  private resumeListener: ((event: UserResumeObserved) => void) | null = null;

  getIdleDurationMs(): number {
    return 0;
  }

  onIdle(listener: (event: UserIdleObserved) => void): () => void {
    this.idleListener = listener;
    return () => {
      if (this.idleListener === listener) this.idleListener = null;
    };
  }

  onResume(listener: (event: UserResumeObserved) => void): () => void {
    this.resumeListener = listener;
    return () => {
      if (this.resumeListener === listener) this.resumeListener = null;
    };
  }

  emitIdle(event: UserIdleObserved): void {
    this.idleListener?.(event);
  }
}

const notificationWriter = {
  enqueueNotificationRequested: vi.fn(),
} as unknown as NotificationRequestedWriterPort;
const userTimeContextPort = {
  getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
};

const trigger = createActiveUsageTrigger({
  requiredActiveMs: 1_000,
  naturalBreakCredit: { idleDurationMs: 500 },
  protocolBreakCredit: { kind: 'Stand', minimumBreakMs: 500 },
});

function createComposition(idleSensor = new ControlledIdleSensor()) {
  return {
    idleSensor,
    composed: composeReminder({
      db: new RoutineDb(JSON.stringify(trigger)),
      identityId: 'identity-1',
      notificationRequestedWriter: notificationWriter,
      userTimeContextPort,
      idleSensor,
      interventionPolicy: {
        gentleDurationMs: 100,
        graceDurationMs: 100,
        guidedDurationMs: 100,
        strictEnabled: false,
      },
    }),
  };
}

describe('composeReminder local Routine vertical slice', () => {
  it('projects durable ActiveUsage state and turns threshold due into InterventionRuntime truth', async () => {
    const { composed } = createComposition();
    await composed.refreshLocalRoutineRegistrations();
    const t0 = Date.now();

    composed.activeUsageRuntime.advance(asInstant(t0));
    composed.activeUsageRuntime.advance(asInstant(t0 + 1_000));

    expect(composed.activeUsageRuntime.getSnapshot('identity-1', 'routine-opaque')).toMatchObject({
      accumulatedActiveMs: 1_000,
      generation: 1,
      thresholdSignaled: true,
    });
    expect(
      composed.interventionRuntime.getSnapshot('routine:routine-opaque:active-usage:1'),
    ).toMatchObject({
      identityId: 'identity-1',
      routineId: 'routine-opaque',
      state: 'Due',
      policy: { strictEnabled: false },
    });
  });

  it('closes the exact due intervention when an explicit compatible protocol break satisfies the lane', async () => {
    const { composed } = createComposition();
    await composed.refreshLocalRoutineRegistrations();
    const t0 = Date.now();
    composed.activeUsageRuntime.advance(asInstant(t0));
    composed.activeUsageRuntime.advance(asInstant(t0 + 1_000));

    const fact: ProtocolBreakCompletionFact = {
      factId: 'session-1:1:break:ShortBreak',
      identityId: 'identity-1',
      sessionId: 'session-1',
      protocolId: 'protocol-1',
      phaseKey: '1:break:ShortBreak',
      phaseId: 'break',
      phaseKind: 'ShortBreak',
      cycle: 1,
      breakStartedAt: asInstant(t0 + 1_000),
      completedAt: asInstant(t0 + 1_500),
      breakDurationMs: 500,
      capabilities: ['stand'],
    };

    expect(composed.protocolBreakCreditRuntime.creditBreak(fact).credited).toHaveLength(1);
    expect(
      composed.interventionRuntime.getSnapshot('routine:routine-opaque:active-usage:1'),
    ).toMatchObject({ state: 'Completed', completionReason: 'natural-stop' });
    expect(composed.activeUsageRuntime.getSnapshot('identity-1', 'routine-opaque')).toMatchObject({
      accumulatedActiveMs: 0,
      generation: 2,
      thresholdSignaled: false,
    });
  });

  it('closes an already-due intervention when a natural idle break satisfies the lane', async () => {
    const { composed, idleSensor } = createComposition();
    await composed.refreshLocalRoutineRegistrations();
    const t0 = Date.now();
    composed.activeUsageRuntime.advance(asInstant(t0));
    composed.activeUsageRuntime.advance(asInstant(t0 + 1_000));

    composed.activityRuntime.start();
    composed.activeUsageRuntime.start();
    const idleAt = asInstant(t0 + 1_600);
    idleSensor.emitIdle({ at: idleAt, idleDurationMs: 600 });

    expect(
      composed.interventionRuntime.getSnapshot('routine:routine-opaque:active-usage:1'),
    ).toMatchObject({ state: 'Completed', completionReason: 'natural-stop' });
    expect(
      composed.activeUsageRuntime.getSnapshot('identity-1', 'routine-opaque')?.generation,
    ).toBe(2);

    composed.activeUsageRuntime.stop();
    composed.activityRuntime.stop();
  });
});
