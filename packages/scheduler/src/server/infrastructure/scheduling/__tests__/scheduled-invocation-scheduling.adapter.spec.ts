import { describe, expect, it, vi } from 'vitest';
import type {
  ScheduledIntent,
  ScheduledInvocation as ScheduledInvocationState,
  SchedulingOwner,
} from '@memoflow/contracts/schedule';
import { buildSchedulingKey, SchedulingReconcileError } from '../../../../scheduling';
import { ScheduledInvocation } from '../../../domain/entities/scheduled-invocation';
import type { IScheduledInvocationRepository } from '../../../domain/repositories/i-scheduled-invocation-repository';
import { createScheduledInvocationSchedulingPort } from '../scheduled-invocation-scheduling.adapter';

const retryPolicy = {
  enabled: true,
  maxRetries: 3,
  initialDelayMs: 5_000,
  maxDelayMs: 60_000,
  backoffMultiplier: 2,
} as const;

function makeIntent(
  owner: SchedulingOwner,
  overrides: Partial<ScheduledIntent> = {},
): ScheduledIntent {
  return {
    schedulingKey: buildSchedulingKey(owner.type, owner.id, 'occurrence-1'),
    handlerKey: 'routine.wallclock.fire',
    runAt: 1_800_000_060_000,
    payloadVersion: 1,
    payload: { occurrenceId: 'occurrence-1' },
    sourceRevision: 1,
    retryPolicy,
    priority: 'normal',
    timeoutMs: null,
    observability: { name: 'Routine', tags: ['routine'] },
    ...overrides,
  };
}

function materialize(
  owner: SchedulingOwner,
  intent: ScheduledIntent,
  status: ScheduledInvocationState['status'] = 'pending',
): ScheduledInvocationState {
  const invocation = ScheduledInvocation.create({
    id: 'invocation-1',
    identityId: owner.identityId,
    owner,
    schedulingKey: intent.schedulingKey,
    handlerKey: intent.handlerKey,
    payloadVersion: intent.payloadVersion,
    payload: intent.payload,
    runAt: intent.runAt,
    sourceRevision: intent.sourceRevision ?? null,
    retryPolicy,
    priority: intent.priority ?? 'normal',
    timeoutMs: intent.timeoutMs ?? null,
    name: intent.observability?.name ?? null,
    tags: intent.observability?.tags ?? [],
    now: 1_800_000_000_000,
  });
  const state = invocation.toState();
  return status === 'pending' ? state : { ...state, status };
}

function createRepository(initial: readonly ScheduledInvocationState[]) {
  let stored = [...initial];
  const receipts: unknown[] = [];

  const repository = {
    findByOwner: vi.fn(async () => stored),
    save: vi.fn(async (invocation: ScheduledInvocationState) => {
      const index = stored.findIndex((item) => item.id === invocation.id);
      if (index >= 0) stored[index] = invocation;
      else stored.push(invocation);
    }),
    supersedeStale: vi.fn(
      async (_owner: SchedulingOwner, keepSchedulingKeys: readonly string[]) => {
        const keep = new Set(keepSchedulingKeys);
        let count = 0;
        stored = stored.map((item) => {
          if (keep.has(item.schedulingKey) || item.status === 'superseded') return item;
          count += 1;
          return {
            ...item,
            status: 'superseded' as const,
            claimToken: null,
            claimExpiresAt: null,
            nextAttemptAt: null,
          };
        });
        return count;
      },
    ),
    appendSchedulingReconcileReceipt: vi.fn(async (receipt: unknown) => {
      receipts.push(receipt);
    }),
    withTransaction: vi.fn(
      async <T>(work: (tx: IScheduledInvocationRepository) => Promise<T>): Promise<T> =>
        work(repository as unknown as IScheduledInvocationRepository),
    ),
  } as unknown as IScheduledInvocationRepository;

  return {
    repository,
    current: () => stored,
    receipts,
  };
}

describe('ScheduledInvocationSchedulingAdapter', () => {
  it('rejects duplicate desired scheduling keys before writing', async () => {
    const withTransaction = vi.fn();
    const repository = { withTransaction } as unknown as IScheduledInvocationRepository;
    const port = createScheduledInvocationSchedulingPort(repository, {
      now: () => 1_800_000_000_000,
      operationIdFactory: () => 'operation:duplicate-key',
    });
    const owner = { identityId: 'identity-1', type: 'task-plan', id: 'plan-1' };
    const schedulingKey = buildSchedulingKey(owner.type, owner.id, 'reminder:1');
    const desired = {
      schedulingKey,
      handlerKey: 'task.reminder.fire',
      runAt: 1_800_000_060_000,
      payloadVersion: 1,
      payload: { occurrenceId: 'occurrence-1' },
    };

    await expect(port.reconcile(owner, [desired, { ...desired }])).rejects.toMatchObject({
      name: SchedulingReconcileError.name,
      receipt: {
        status: 'failed',
        failure: { code: 'DUPLICATE_SCHEDULING_KEY', retryable: false },
      },
    });
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('re-arms an unchanged superseded stable scheduling identity when it becomes desired again', async () => {
    const owner = { identityId: 'identity-1', type: 'routine.routine', id: 'routine-1' };
    const intent = makeIntent(owner);
    const fixture = createRepository([materialize(owner, intent, 'superseded')]);
    const port = createScheduledInvocationSchedulingPort(fixture.repository, {
      now: () => 1_800_000_001_000,
      operationIdFactory: () => 'operation:rearm-same',
    });

    const receipt = await port.reconcile(owner, [intent]);

    expect(receipt).toMatchObject({
      status: 'succeeded',
      desiredCount: 1,
      createdCount: 0,
      updatedCount: 1,
      unchangedCount: 0,
    });
    expect(fixture.current()[0]).toMatchObject({
      schedulingKey: intent.schedulingKey,
      status: 'pending',
      sourceRevision: 1,
    });
  });

  it('re-arms a superseded stable scheduling identity with the latest desired semantics', async () => {
    const owner = { identityId: 'identity-1', type: 'routine.routine', id: 'routine-1' };
    const original = makeIntent(owner);
    const changed = makeIntent(owner, {
      sourceRevision: 2,
      payload: { occurrenceId: 'occurrence-1', label: 'updated' },
      observability: { name: 'Routine Updated', tags: ['routine'] },
    });
    const fixture = createRepository([materialize(owner, original, 'superseded')]);
    const port = createScheduledInvocationSchedulingPort(fixture.repository, {
      now: () => 1_800_000_002_000,
      operationIdFactory: () => 'operation:rearm-changed',
    });

    const receipt = await port.reconcile(owner, [changed]);

    expect(receipt.updatedCount).toBe(1);
    expect(fixture.current()[0]).toMatchObject({
      status: 'pending',
      sourceRevision: 2,
      payload: { occurrenceId: 'occurrence-1', label: 'updated' },
      observability: { name: 'Routine Updated', tags: ['routine'] },
    });
  });

  it('still rejects reuse of an execution-terminal stable scheduling identity with changed semantics', async () => {
    const owner = { identityId: 'identity-1', type: 'routine.routine', id: 'routine-1' };
    const original = makeIntent(owner);
    const changed = makeIntent(owner, { sourceRevision: 2 });
    const fixture = createRepository([materialize(owner, original, 'succeeded')]);
    const port = createScheduledInvocationSchedulingPort(fixture.repository, {
      now: () => 1_800_000_003_000,
      operationIdFactory: () => 'operation:terminal-collision',
    });

    await expect(port.reconcile(owner, [changed])).rejects.toMatchObject({
      name: SchedulingReconcileError.name,
      receipt: {
        status: 'failed',
        failure: { code: 'PERSISTED_KEY_COLLISION', retryable: false },
      },
    });
    expect(fixture.current()[0]?.status).toBe('succeeded');
  });
});
