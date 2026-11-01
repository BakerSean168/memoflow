import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PowerSyncDatabase } from '@powersync/node';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import type { ScheduledIntent, SchedulingOwner } from '@memoflow/schedule-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSchedulingKey } from '../../../../../scheduling';
import { createScheduledInvocationSchedulingPort } from '../../../../scheduling/scheduled-invocation-scheduling.adapter';
import { PowerSyncScheduledInvocationRepository } from '../scheduled-invocation-powersync.repository';

let db: PowerSyncDatabase;
let directory: string;

const owner: SchedulingOwner = { identityId: 'identity-1', type: 'routine.routine', id: 'routine-1' };
const schedulingKey = buildSchedulingKey(owner.type, owner.id, 'occurrence-1');
const runAt = Date.parse('2026-10-25T12:00:00.000Z');

const intent: ScheduledIntent = {
  schedulingKey,
  handlerKey: 'routine.wallclock.fire',
  runAt,
  payloadVersion: 1,
  payload: { occurrenceId: 'occurrence-1' },
  sourceRevision: 1,
  retryPolicy: {
    enabled: true,
    maxRetries: 3,
    initialDelayMs: 5_000,
    maxDelayMs: 60_000,
    backoffMultiplier: 2,
  },
  priority: 'normal',
  timeoutMs: null,
  observability: { name: 'Routine', tags: ['routine'] },
};

beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-scheduler-reconcile-'));
  db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: path.join(directory, 'test.db') },
  });
  await db.waitForReady();
});

afterEach(async () => {
  await db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

async function insertTerminalRow(timestamps: {
  runAt: string;
  nextAttemptAt: string | null;
  claimExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}): Promise<void> {
  await db.execute(
    `INSERT INTO scheduled_invocations (
      id, identity_id, owner_type, owner_id, scheduling_key, handler_key, payload_version, payload,
      run_at, source_revision, retry_enabled, max_retries, initial_delay_ms, max_delay_ms,
      backoff_multiplier, priority, timeout_ms, status, attempt_count, next_attempt_at,
      claim_token, claim_expires_at, fencing_token, name, tags, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'invocation-1',
      owner.identityId,
      owner.type,
      owner.id,
      schedulingKey,
      intent.handlerKey,
      intent.payloadVersion,
      JSON.stringify(intent.payload),
      timestamps.runAt,
      '1',
      1,
      3,
      5_000,
      60_000,
      2,
      'normal',
      null,
      'dead_letter',
      4,
      timestamps.nextAttemptAt,
      null,
      timestamps.claimExpiresAt,
      4,
      'Routine',
      JSON.stringify(['routine']),
      timestamps.createdAt,
      timestamps.updatedAt,
    ],
  );
}

async function reconcile() {
  const repository = new PowerSyncScheduledInvocationRepository(db);
  const port = createScheduledInvocationSchedulingPort(repository, {
    now: () => runAt,
    operationIdFactory: () => 'operation:reconcile-731',
  });
  return port.reconcile(owner, [intent]);
}

describe('scheduling reconcile over cloud-synced PowerSync rows (#731)', () => {
  it('leaves a naive-UTC terminal row unchanged when only serialization differs', async () => {
    await insertTerminalRow({
      runAt: '2026-10-25T12:00:00.000000',
      nextAttemptAt: null,
      claimExpiresAt: null,
      createdAt: '2026-10-25T11:59:59.000000',
      updatedAt: '2026-10-25T11:59:58.000000',
    });

    const receipt = await reconcile();

    expect(receipt).toMatchObject({
      status: 'succeeded',
      desiredCount: 1,
      createdCount: 0,
      updatedCount: 0,
      deletedCount: 0,
      unchangedCount: 1,
    });
    expect(await db.get('SELECT status FROM scheduled_invocations WHERE id = ?', ['invocation-1']))
      .toEqual({ status: 'dead_letter' });
  });

  it('leaves a locally written Z-suffixed terminal row unchanged', async () => {
    await insertTerminalRow({
      runAt: '2026-10-25T12:00:00.000Z',
      nextAttemptAt: null,
      claimExpiresAt: null,
      createdAt: '2026-10-25T11:59:59.000Z',
      updatedAt: '2026-10-25T11:59:58.000Z',
    });

    const receipt = await reconcile();

    expect(receipt).toMatchObject({ status: 'succeeded', unchangedCount: 1 });
  });

  it('still reports a collision when the persisted revision value really changed', async () => {
    await insertTerminalRow({
      runAt: '2026-10-25T12:00:00.000000',
      nextAttemptAt: null,
      claimExpiresAt: null,
      createdAt: '2026-10-25T11:59:59.000000',
      updatedAt: '2026-10-25T11:59:58.000000',
    });
    await db.execute('UPDATE scheduled_invocations SET source_revision = ? WHERE id = ?', [
      '2',
      'invocation-1',
    ]);

    await expect(reconcile()).rejects.toMatchObject({
      receipt: {
        status: 'failed',
        failure: { code: 'PERSISTED_KEY_COLLISION', retryable: false },
      },
    });
  });
});
