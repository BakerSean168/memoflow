import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PowerSyncDatabase } from '@powersync/node';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import type { ScheduledInvocation } from '@memoflow/schedule-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PowerSyncScheduledInvocationRepository } from '../scheduled-invocation-powersync.repository';

let db: PowerSyncDatabase;
let directory: string;
let repo: PowerSyncScheduledInvocationRepository;
const now = Date.parse('2026-10-29T00:00:00.000Z');

beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-scheduler-save-'));
  db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: path.join(directory, 'test.db') },
  });
  await db.waitForReady();
  repo = new PowerSyncScheduledInvocationRepository(db);
});

afterEach(async () => {
  await db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('scheduled invocation save on real PowerSync (#715)', () => {
  it('inserts and then updates every persisted field without shifting bindings', async () => {
    const invocation: ScheduledInvocation = {
      id: 'invocation-save',
      identityId: 'identity-save',
      ownerType: 'task',
      ownerId: 'owner-save',
      schedulingKey: 'task:save',
      handlerKey: 'task.execute',
      payloadVersion: 3,
      payload: { taskId: 'owner-save', nested: { enabled: true } },
      runAt: now + 1000,
      sourceRevision: 'revision-7',
      retryPolicy: {
        enabled: true,
        maxRetries: 4,
        initialDelayMs: 123,
        maxDelayMs: 9876,
        backoffMultiplier: 2.5,
      },
      priority: 'high',
      timeoutMs: 4321,
      status: 'running',
      attemptCount: 2,
      nextAttemptAt: now + 2000,
      claimToken: 'claim-save',
      claimExpiresAt: now + 3000,
      fencingToken: 9,
      observability: { name: 'Save invocation', tags: ['save', 'roundtrip'] },
      createdAt: now - 1000,
      updatedAt: now,
    };
    await repo.save(invocation);
    expect(await repo.findById(invocation.id)).toEqual(invocation);

    const updated: ScheduledInvocation = {
      ...invocation,
      identityId: 'identity-updated',
      ownerType: 'routine',
      ownerId: 'owner-updated',
      schedulingKey: 'routine:updated',
      handlerKey: 'routine.execute',
      payloadVersion: 5,
      payload: null,
      runAt: now + 4000,
      sourceRevision: null,
      retryPolicy: {
        enabled: false,
        maxRetries: 6,
        initialDelayMs: 456,
        maxDelayMs: 12345,
        backoffMultiplier: 3,
      },
      priority: 'low',
      timeoutMs: null,
      status: 'retry_wait',
      attemptCount: 3,
      nextAttemptAt: now + 5000,
      claimToken: null,
      claimExpiresAt: null,
      fencingToken: 10,
      observability: { name: null, tags: ['updated'] },
      updatedAt: now + 6000,
    };
    await repo.save(updated);
    expect(await repo.findById(invocation.id)).toEqual(updated);
    expect(await db.get('SELECT COUNT(*) AS count FROM scheduled_invocations')).toEqual({
      count: 1,
    });
  });
});
