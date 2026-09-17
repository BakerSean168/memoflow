import { describe, expect, it, vi } from 'vitest';
import type { ScheduledInvocation } from '@memoflow/contracts/schedule';
import { FakeTimer } from '@memoflow/patterns/scheduler';
import type {
  IScheduledInvocationRepository,
  ScheduledInvocationClaim,
} from '../../domain/repositories/i-scheduled-invocation-repository';
import { ScheduledInvocationQueue } from './scheduled-invocation-queue';

function invocation(overrides: Partial<ScheduledInvocation> = {}): ScheduledInvocation {
  return {
    id: 'invocation-1',
    identityId: 'identity-1',
    ownerType: 'task-plan',
    ownerId: 'plan-1',
    schedulingKey: 'task:plan-1:reminder-1',
    handlerKey: 'task.reminder.fire',
    payloadVersion: 1,
    payload: { occurrenceId: 'occurrence-1' },
    runAt: 1_100 as ScheduledInvocation['runAt'],
    sourceRevision: '1',
    retryPolicy: {
      enabled: true,
      maxRetries: 2,
      initialDelayMs: 100,
      maxDelayMs: 1_000,
      backoffMultiplier: 2,
    },
    priority: 'normal',
    timeoutMs: null,
    status: 'pending',
    attemptCount: 0,
    nextAttemptAt: null,
    claimToken: null,
    claimExpiresAt: null,
    fencingToken: 0,
    observability: { name: 'Task reminder', tags: ['task'] },
    createdAt: 900 as ScheduledInvocation['createdAt'],
    updatedAt: 900 as ScheduledInvocation['updatedAt'],
    ...overrides,
  };
}

function claim(item: ScheduledInvocation, attemptNumber: number): ScheduledInvocationClaim {
  return {
    invocation: item,
    attempt: {
      id: `attempt-${attemptNumber}`,
      identityId: item.identityId,
      invocationId: item.id,
      attemptNumber,
      startedAt: item.runAt,
      finishedAt: null,
      outcome: 'retryable_failure',
      result: null,
      failureCode: null,
      failureMessage: null,
      failureRetryable: null,
      workerId: 'worker-1',
      claimToken: `claim-${attemptNumber}`,
      fencingToken: attemptNumber,
      createdAt: item.runAt,
    },
  };
}

function repository(runnable: ScheduledInvocation[]) {
  let attemptNumber = 0;
  return {
    recoverExpiredClaims: vi.fn().mockResolvedValue(0),
    findRunnable: vi.fn().mockResolvedValue(runnable),
    claimAndStart: vi.fn().mockImplementation(async () => {
      attemptNumber += 1;
      return claim(runnable[0]!, attemptNumber);
    }),
    completeAttempt: vi.fn().mockResolvedValue(true),
  } as unknown as IScheduledInvocationRepository & {
    recoverExpiredClaims: ReturnType<typeof vi.fn>;
    findRunnable: ReturnType<typeof vi.fn>;
    claimAndStart: ReturnType<typeof vi.fn>;
    completeAttempt: ReturnType<typeof vi.fn>;
  };
}

describe('ScheduledInvocationQueue canonical runtime', () => {
  it('recovers expired claims and reloads future runnable work on every restart', async () => {
    const timer = new FakeTimer(1_000);
    const item = invocation();
    const repo = repository([item]);
    const handler = { execute: vi.fn().mockResolvedValue({ status: 'succeeded' as const }) };
    const queue = new ScheduledInvocationQueue({ repository: repo, handlerRegistry: handler, timer });

    await queue.start();
    expect(repo.recoverExpiredClaims).toHaveBeenCalledWith(1_000, 1_000);
    expect(repo.findRunnable).toHaveBeenCalledTimes(1);
    expect(timer.getPendingCount()).toBe(1);

    queue.stop();
    expect(timer.getPendingCount()).toBe(0);

    await queue.start();
    expect(repo.recoverExpiredClaims).toHaveBeenCalledTimes(2);
    expect(repo.findRunnable).toHaveBeenCalledTimes(2);

    timer.tick(100);
    await vi.waitFor(() => expect(repo.completeAttempt).toHaveBeenCalledTimes(1));
    expect(handler.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'identity-1',
        handlerKey: 'task.reminder.fire',
        schedulingKey: 'task:plan-1:reminder-1',
      }),
    );
    expect(repo.completeAttempt).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'succeeded', nextAttemptAt: null }),
    );
    queue.stop();
  });

  it('requeues retryable failures using the invocation retry policy, then succeeds', async () => {
    const timer = new FakeTimer(1_000);
    const item = invocation({ runAt: 1_000 as ScheduledInvocation['runAt'] });
    const repo = repository([item]);
    const handler = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'retryable' as const,
          failure: { code: 'TEMPORARY', message: 'retry me', retryable: true },
        })
        .mockResolvedValueOnce({ status: 'succeeded' as const }),
    };
    const queue = new ScheduledInvocationQueue({ repository: repo, handlerRegistry: handler, timer });

    await queue.start();
    timer.tick(0);
    await vi.waitFor(() => expect(repo.completeAttempt).toHaveBeenCalledTimes(1));
    expect(repo.completeAttempt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        attemptNumber: 1,
        status: 'retry_wait',
        nextAttemptAt: 1_100,
        failureCode: 'TEMPORARY',
        failureRetryable: true,
      }),
    );

    timer.tick(99);
    expect(handler.execute).toHaveBeenCalledTimes(1);
    timer.tick(1);
    await vi.waitFor(() => expect(repo.completeAttempt).toHaveBeenCalledTimes(2));
    expect(repo.completeAttempt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ attemptNumber: 2, status: 'succeeded', nextAttemptAt: null }),
    );
    queue.stop();
  });

  it('honors the desktop identity guard before claiming work', async () => {
    const timer = new FakeTimer(1_000);
    const item = invocation({ runAt: 1_000 as ScheduledInvocation['runAt'] });
    const repo = repository([item]);
    const handler = { execute: vi.fn() };
    const queue = new ScheduledInvocationQueue({
      repository: repo,
      handlerRegistry: handler,
      timer,
      shouldExecuteIdentity: async () => false,
    });

    await queue.start();
    timer.tick(0);
    await new Promise((resolve) => setImmediate(resolve));
    expect(repo.claimAndStart).not.toHaveBeenCalled();
    expect(handler.execute).not.toHaveBeenCalled();
    queue.stop();
  });
});
