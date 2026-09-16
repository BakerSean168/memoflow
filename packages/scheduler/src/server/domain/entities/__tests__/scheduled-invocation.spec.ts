import { describe, expect, it } from 'vitest';
import type {
  InvocationAttemptOutcome,
  ScheduledInvocationRetryPolicy,
  ScheduledInvocationStatus,
} from '@memoflow/contracts/schedule';
import {
  ScheduledInvocation,
  ScheduledInvocationTransitionError,
  isTerminalScheduledInvocationStatus,
  type ScheduledInvocationState,
} from '../scheduled-invocation';

const retryPolicy: ScheduledInvocationRetryPolicy = {
  enabled: true,
  maxRetries: 3,
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
};

function createInvocation(overrides: Partial<Parameters<typeof ScheduledInvocation.create>[0]> = {}) {
  return ScheduledInvocation.create({
    id: 'invocation-1',
    identityId: 'identity-1',
    owner: { identityId: 'identity-1', type: 'routine', id: 'routine-1' },
    schedulingKey: 'routine:1',
    handlerKey: 'routine.execute',
    payloadVersion: 1,
    payload: { routineId: 'routine-1' },
    runAt: 1_000,
    sourceRevision: 7,
    retryPolicy,
    priority: 'normal',
    timeoutMs: 10_000,
    name: 'Routine execution',
    tags: ['routine'],
    now: 100,
    ...overrides,
  });
}

function runningInvocation(now = 1_000) {
  const invocation = createInvocation();
  invocation.claim('claim-1', now + 5_000, now);
  return invocation;
}

describe('ScheduledInvocation', () => {
  it('creates the canonical pending state and exposes an isolated snapshot', () => {
    const invocation = createInvocation();

    expect(invocation.id).toBe('invocation-1');
    expect(invocation.identityId).toBe('identity-1');
    expect(invocation.owner).toEqual({ identityId: 'identity-1', type: 'routine', id: 'routine-1' });
    expect(invocation.ownerType).toBe('routine');
    expect(invocation.ownerId).toBe('routine-1');
    expect(invocation.schedulingKey).toBe('routine:1');
    expect(invocation.handlerKey).toBe('routine.execute');
    expect(invocation.payloadVersion).toBe(1);
    expect(invocation.payload).toEqual({ routineId: 'routine-1' });
    expect(invocation.runAt).toBe(1_000);
    expect(invocation.sourceRevision).toBe(7);
    expect(invocation.retryPolicy).toEqual(retryPolicy);
    expect(invocation.priority).toBe('normal');
    expect(invocation.timeoutMs).toBe(10_000);
    expect(invocation.status).toBe('pending');
    expect(invocation.attemptCount).toBe(0);
    expect(invocation.nextAttemptAt).toBeNull();
    expect(invocation.claimToken).toBeNull();
    expect(invocation.claimExpiresAt).toBeNull();
    expect(invocation.fencingToken).toBe(0);
    expect(invocation.observability).toEqual({ name: 'Routine execution', tags: ['routine'] });
    expect(invocation.createdAt).toBe(100);
    expect(invocation.updatedAt).toBe(100);

    const state = invocation.toState();
    state.observability.tags.push('mutated');
    expect(invocation.observability.tags).toEqual(['routine']);
  });

  it('uses optional defaults and omits null source revision from handler context', () => {
    const invocation = ScheduledInvocation.create({
      identityId: 'identity-1',
      owner: { identityId: 'identity-1', type: 'goal', id: 'goal-1' },
      schedulingKey: 'goal:1',
      handlerKey: 'goal.execute',
      payloadVersion: 2,
      payload: null,
      runAt: 2_000,
      retryPolicy,
      priority: 'high',
      now: 200,
    });

    expect(invocation.id).toEqual(expect.any(String));
    expect(invocation.sourceRevision).toBeNull();
    expect(invocation.timeoutMs).toBeNull();
    expect(invocation.observability).toEqual({ name: null, tags: [] });
    expect(invocation.toHandlerContext()).toEqual({
      identityId: 'identity-1',
      owner: { identityId: 'identity-1', type: 'goal', id: 'goal-1' },
      schedulingKey: 'goal:1',
      handlerKey: 'goal.execute',
      runAt: 2_000,
      payloadVersion: 2,
      payload: null,
    });
  });

  it('loads persisted state defensively and includes source revision in handler context', () => {
    const original = createInvocation().toState();
    const loaded = ScheduledInvocation.load(original);
    original.observability.tags.push('outside');

    expect(loaded.observability.tags).toEqual(['routine']);
    expect(loaded.toHandlerContext()).toEqual({
      identityId: 'identity-1',
      owner: { identityId: 'identity-1', type: 'routine', id: 'routine-1' },
      schedulingKey: 'routine:1',
      handlerKey: 'routine.execute',
      runAt: 1_000,
      payloadVersion: 1,
      payload: { routineId: 'routine-1' },
      sourceRevision: 7,
    });
  });

  it('reconciles desired state and clears retry/claim state when not running', () => {
    const state: ScheduledInvocationState = {
      ...createInvocation().toState(),
      status: 'retry_wait',
      nextAttemptAt: 1_500,
      claimToken: 'stale-claim',
      claimExpiresAt: 1_600,
    };
    const invocation = ScheduledInvocation.load(state);

    invocation.applyDesired({
      handlerKey: 'routine.execute.v2',
      payloadVersion: 2,
      payload: { value: 2 },
      runAt: 3_000,
      sourceRevision: null,
      retryPolicy: { ...retryPolicy, maxRetries: 5 },
      priority: 'urgent',
      timeoutMs: null,
      name: null,
      tags: ['changed'],
      now: 250,
    });

    expect(invocation.toState()).toMatchObject({
      handlerKey: 'routine.execute.v2',
      payloadVersion: 2,
      payload: { value: 2 },
      runAt: 3_000,
      sourceRevision: null,
      priority: 'urgent',
      timeoutMs: null,
      status: 'pending',
      nextAttemptAt: null,
      claimToken: null,
      claimExpiresAt: null,
      observability: { name: null, tags: ['changed'] },
      updatedAt: 250,
    });
  });

  it('preserves a live claim while applying desired changes to a running invocation', () => {
    const invocation = runningInvocation();
    const claimToken = invocation.claimToken;
    const claimExpiresAt = invocation.claimExpiresAt;

    invocation.applyDesired({
      handlerKey: 'routine.execute.v2',
      payloadVersion: 2,
      payload: { changed: true },
      runAt: 4_000,
      retryPolicy,
      priority: 'low',
      now: 1_100,
    });

    expect(invocation.status).toBe('running');
    expect(invocation.claimToken).toBe(claimToken);
    expect(invocation.claimExpiresAt).toBe(claimExpiresAt);
    expect(invocation.sourceRevision).toBeNull();
    expect(invocation.timeoutMs).toBeNull();
  });

  it('claims due pending work, increments attempt/fence, and rejects premature work', () => {
    const invocation = createInvocation();

    expect(() => invocation.claim('early', 2_000, 999)).toThrow('is not due');
    expect(invocation.claim('claim-1', 2_000, 1_000)).toBe(1);
    expect(invocation.toState()).toMatchObject({
      status: 'running',
      attemptCount: 1,
      claimToken: 'claim-1',
      claimExpiresAt: 2_000,
      fencingToken: 1,
      updatedAt: 1_000,
    });
    expect(() => invocation.claim('claim-2', 3_000, 1_100)).toThrow(
      ScheduledInvocationTransitionError,
    );
  });

  it('claims retry_wait work according to nextAttemptAt', () => {
    const invocation = runningInvocation();
    invocation.complete('retryable_failure', 2_000, 1_100);

    expect(invocation.status).toBe('retry_wait');
    expect(() => invocation.claim('retry', 3_000, 1_999)).toThrow('is not due');
    expect(invocation.claim('retry', 3_000, 2_000)).toBe(2);
    expect(invocation.fencingToken).toBe(2);
  });

  it.each<{
    outcome: InvocationAttemptOutcome;
    nextAttemptAt: number | null;
    expected: ScheduledInvocationStatus;
  }>([
    { outcome: 'succeeded', nextAttemptAt: null, expected: 'succeeded' },
    { outcome: 'skipped', nextAttemptAt: null, expected: 'skipped' },
    { outcome: 'retryable_failure', nextAttemptAt: 2_000, expected: 'retry_wait' },
    { outcome: 'retryable_failure', nextAttemptAt: null, expected: 'dead_letter' },
    { outcome: 'timeout', nextAttemptAt: 2_000, expected: 'retry_wait' },
    { outcome: 'timeout', nextAttemptAt: null, expected: 'dead_letter' },
    { outcome: 'permanent_failure', nextAttemptAt: null, expected: 'failed' },
  ])('maps $outcome completion to $expected', ({ outcome, nextAttemptAt, expected }) => {
    const invocation = runningInvocation();
    invocation.complete(outcome, nextAttemptAt, 1_200);

    expect(invocation.status).toBe(expected);
    expect(invocation.nextAttemptAt).toBe(expected === 'retry_wait' ? nextAttemptAt : null);
    expect(invocation.claimToken).toBeNull();
    expect(invocation.claimExpiresAt).toBeNull();
    expect(invocation.updatedAt).toBe(1_200);
  });

  it('enforces transition rules and records transition time', () => {
    const invocation = createInvocation();
    invocation.transitionTo('superseded', 333);
    expect(invocation.status).toBe('superseded');
    expect(invocation.updatedAt).toBe(333);
    expect(() => invocation.transitionTo('running', 334)).toThrow(
      new ScheduledInvocationTransitionError('superseded', 'running'),
    );
  });

  it.each<{
    status: ScheduledInvocationStatus;
    terminal: boolean;
  }>([
    { status: 'pending', terminal: false },
    { status: 'running', terminal: false },
    { status: 'retry_wait', terminal: false },
    { status: 'succeeded', terminal: true },
    { status: 'skipped', terminal: true },
    { status: 'failed', terminal: true },
    { status: 'dead_letter', terminal: true },
    { status: 'superseded', terminal: true },
  ])('classifies $status terminal=$terminal', ({ status, terminal }) => {
    expect(isTerminalScheduledInvocationStatus(status)).toBe(terminal);
  });
});
