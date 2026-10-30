import { afterEach, describe, expect, it } from 'vitest';
import type { NotificationRequestedWriterPort } from '@memoflow/notification-contracts';
import { createPowerSyncSqliteFixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import {
  createRoutinePowerSyncScheduleExecutionDeps,
  createRoutinePowerSyncScheduleProjectionSource,
} from '../powersync';
import { createRoutineScheduleExecutionSource } from './routine-schedule-execution-source';
import { createElapsedTrigger } from '../../domain/routine';

describe('Routine PowerSync Scheduler adapters', () => {
  const fixtures: Array<ReturnType<typeof createPowerSyncSqliteFixture>> = [];
  afterEach(() => {
    for (const fixture of fixtures.splice(0)) fixture.close();
  });

  it('projects and durably executes an offline last-satisfied occurrence once', async () => {
    const fixture = createPowerSyncSqliteFixture();
    fixtures.push(fixture);
    const now = Date.parse('2026-10-30T12:01:00.000Z');
    const activatedAt = new Date(now - 60_000).toISOString();
    const trigger = createElapsedTrigger({ durationMs: 60_000, anchor: 'last-satisfied' });
    await fixture.db.execute(
      `INSERT INTO routine_definitions
        (id, identity_id, name, description, enabled, trigger_json, activated_at, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, 1, ?, ?)`,
      [
        'routine-offline',
        'identity-1',
        'Stretch',
        'Stand and move.',
        JSON.stringify(trigger),
        activatedAt,
        activatedAt,
        activatedAt,
      ],
    );

    const requested: unknown[] = [];
    const requestedWriter = {
      enqueueNotificationRequested: async (input: unknown, options: unknown) => {
        requested.push({ input, options });
        return {};
      },
    } as unknown as NotificationRequestedWriterPort;
    const eventStore = createRoutinePowerSyncScheduleExecutionDeps(fixture.db, {
      notificationRequestedWriter: requestedWriter,
      now: () => now,
    });
    const projection = createRoutinePowerSyncScheduleProjectionSource(fixture.db, {
      now: () => now,
    });
    const plan = await projection.buildRoutinePlan('routine-offline', 'identity-1');
    expect(plan.desired).toHaveLength(1);

    const intent = plan.desired[0]!;
    const execution = createRoutineScheduleExecutionSource(eventStore);
    const result = await execution.executeRoutineOccurrence({
      ...intent.payload,
      triggerKind: 'Elapsed',
    });

    expect(result).toMatchObject({ kind: 'succeeded', notificationRequested: true });
    expect(
      await fixture.db.get<{ status: string; resolution_state: string }>(
        `SELECT status, resolution_state FROM routine_occurrences WHERE identity_id = ? AND routine_id = ?`,
        ['identity-1', 'routine-offline'],
      ),
    ).toEqual({ status: 'succeeded', resolution_state: 'Open' });
    expect(requested).toHaveLength(1);
    expect(requested[0]).toMatchObject({
      input: {
        envelope: {
          source: 'routine',
          occurrenceKey: intent.payload.occurrenceKey,
          workflowKey: 'routine.intervention',
        },
      },
      options: { txClient: expect.any(Object) },
    });

    const restored = await createRoutinePowerSyncScheduleProjectionSource(fixture.db, {
      now: () => now + 3_600_000,
    }).buildRoutinePlan('routine-offline', 'identity-1');
    expect(restored.desired).toEqual([]);
  });
});
