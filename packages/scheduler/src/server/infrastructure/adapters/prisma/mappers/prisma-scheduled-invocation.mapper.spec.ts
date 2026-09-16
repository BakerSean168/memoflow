import { describe, expect, it } from 'vitest';
import type {
  InvocationAttempt as PrismaInvocationAttempt,
  ScheduledInvocation as PrismaScheduledInvocation,
} from '@memoflow/database';
import type {
  InvocationAttempt,
  ScheduledInvocation,
} from '@memoflow/contracts/schedule';
import {
  PrismaInvocationAttemptMapper,
  PrismaScheduledInvocationMapper,
} from './prisma-scheduled-invocation.mapper';

function invocationRow(
  overrides: Partial<PrismaScheduledInvocation> = {},
): PrismaScheduledInvocation {
  return {
    id: 'invocation-1',
    identityId: 'identity-1',
    ownerType: 'routine',
    ownerId: 'routine-1',
    schedulingKey: 'routine:1',
    handlerKey: 'routine.execute',
    payloadVersion: 2,
    payload: { routineId: 'routine-1' },
    runAt: new Date(1_000),
    sourceRevision: 7,
    retryEnabled: true,
    maxRetries: 3,
    initialDelayMs: 1_000,
    maxDelayMs: 30_000,
    backoffMultiplier: 2,
    priority: 'high',
    timeoutMs: 10_000,
    status: 'retry_wait',
    attemptCount: 2,
    nextAttemptAt: new Date(2_000),
    claimToken: null,
    claimExpiresAt: null,
    fencingToken: 2,
    name: 'Routine execution',
    tags: ['routine', 2],
    createdAt: new Date(100),
    updatedAt: new Date(200),
    ...overrides,
  } as PrismaScheduledInvocation;
}

function invocationDomain(
  overrides: Partial<ScheduledInvocation> = {},
): ScheduledInvocation {
  return {
    id: 'invocation-1',
    identityId: 'identity-1',
    ownerType: 'routine',
    ownerId: 'routine-1',
    schedulingKey: 'routine:1',
    handlerKey: 'routine.execute',
    payloadVersion: 2,
    payload: { routineId: 'routine-1' },
    runAt: 1_000,
    sourceRevision: 'revision-7',
    retryPolicy: {
      enabled: true,
      maxRetries: 3,
      initialDelayMs: 1_000,
      maxDelayMs: 30_000,
      backoffMultiplier: 2,
    },
    priority: 'high',
    timeoutMs: 10_000,
    status: 'running',
    attemptCount: 2,
    nextAttemptAt: 2_000,
    claimToken: 'claim-1',
    claimExpiresAt: 3_000,
    fencingToken: 2,
    observability: { name: 'Routine execution', tags: ['routine'] },
    createdAt: 100,
    updatedAt: 200,
    ...overrides,
  };
}

function attemptRow(
  overrides: Partial<PrismaInvocationAttempt> = {},
): PrismaInvocationAttempt {
  return {
    id: 'attempt-1',
    identityId: 'identity-1',
    invocationId: 'invocation-1',
    attemptNumber: 2,
    startedAt: new Date(100),
    finishedAt: new Date(150),
    outcome: 'retryable_failure',
    result: { partial: true },
    failureCode: 'TEMPORARY_UNAVAILABLE',
    failureMessage: 'try again',
    failureRetryable: true,
    workerId: 'worker-1',
    claimToken: 'claim-1',
    fencingToken: 4,
    createdAt: new Date(100),
    ...overrides,
  } as PrismaInvocationAttempt;
}

function attemptDomain(overrides: Partial<InvocationAttempt> = {}): InvocationAttempt {
  return {
    id: 'attempt-1',
    identityId: 'identity-1',
    invocationId: 'invocation-1',
    attemptNumber: 2,
    startedAt: 100,
    finishedAt: 150,
    outcome: 'succeeded',
    result: { ok: true },
    failureCode: null,
    failureMessage: null,
    failureRetryable: null,
    workerId: 'worker-1',
    claimToken: 'claim-1',
    fencingToken: 4,
    createdAt: 100,
    ...overrides,
  };
}

describe('PrismaScheduledInvocationMapper', () => {
  it('maps a persisted invocation to the canonical scheduling contract', () => {
    expect(PrismaScheduledInvocationMapper.toDomain(invocationRow())).toEqual({
      id: 'invocation-1',
      identityId: 'identity-1',
      ownerType: 'routine',
      ownerId: 'routine-1',
      schedulingKey: 'routine:1',
      handlerKey: 'routine.execute',
      payloadVersion: 2,
      payload: { routineId: 'routine-1' },
      runAt: 1_000,
      sourceRevision: 7,
      retryPolicy: {
        enabled: true,
        maxRetries: 3,
        initialDelayMs: 1_000,
        maxDelayMs: 30_000,
        backoffMultiplier: 2,
      },
      priority: 'high',
      timeoutMs: 10_000,
      status: 'retry_wait',
      attemptCount: 2,
      nextAttemptAt: 2_000,
      claimToken: null,
      claimExpiresAt: null,
      fencingToken: 2,
      observability: { name: 'Routine execution', tags: ['routine', '2'] },
      createdAt: 100,
      updatedAt: 200,
    });
  });

  it('normalizes unsupported source revisions, non-array tags, and nullable dates', () => {
    const row = invocationRow({
      sourceRevision: { revision: 1 },
      tags: { tag: 'not-an-array' },
      nextAttemptAt: null,
      claimExpiresAt: null,
    } as Partial<PrismaScheduledInvocation>);

    expect(PrismaScheduledInvocationMapper.toDomain(row)).toMatchObject({
      sourceRevision: null,
      nextAttemptAt: null,
      claimExpiresAt: null,
      observability: { name: 'Routine execution', tags: [] },
    });
  });

  it('preserves string source revisions', () => {
    expect(
      PrismaScheduledInvocationMapper.toDomain(invocationRow({ sourceRevision: 'rev-2' }))
        .sourceRevision,
    ).toBe('rev-2');
  });

  it('maps canonical invocation state to Prisma create data with dates', () => {
    const create = PrismaScheduledInvocationMapper.toCreate(invocationDomain());

    expect(create).toMatchObject({
      id: 'invocation-1',
      sourceRevision: 'revision-7',
      retryEnabled: true,
      maxRetries: 3,
      status: 'running',
      claimToken: 'claim-1',
      tags: ['routine'],
    });
    expect(create.runAt).toEqual(new Date(1_000));
    expect(create.nextAttemptAt).toEqual(new Date(2_000));
    expect(create.claimExpiresAt).toEqual(new Date(3_000));
    expect(create.createdAt).toEqual(new Date(100));
    expect(create.updatedAt).toEqual(new Date(200));
  });

  it('maps null scheduling fields without manufacturing dates', () => {
    const create = PrismaScheduledInvocationMapper.toCreate(
      invocationDomain({
        payload: undefined,
        sourceRevision: null,
        nextAttemptAt: null,
        claimExpiresAt: null,
      }),
    );

    expect(create.payload).toBeNull();
    expect(create.sourceRevision).toBeNull();
    expect(create.nextAttemptAt).toBeNull();
    expect(create.claimExpiresAt).toBeNull();
  });
});

describe('PrismaInvocationAttemptMapper', () => {
  it('maps a completed persisted attempt including structured result', () => {
    expect(PrismaInvocationAttemptMapper.toDomain(attemptRow())).toEqual({
      id: 'attempt-1',
      identityId: 'identity-1',
      invocationId: 'invocation-1',
      attemptNumber: 2,
      startedAt: 100,
      finishedAt: 150,
      outcome: 'retryable_failure',
      result: { partial: true },
      failureCode: 'TEMPORARY_UNAVAILABLE',
      failureMessage: 'try again',
      failureRetryable: true,
      workerId: 'worker-1',
      claimToken: 'claim-1',
      fencingToken: 4,
      createdAt: 100,
    });
  });

  it('normalizes unfinished attempts and non-object results', () => {
    expect(
      PrismaInvocationAttemptMapper.toDomain(attemptRow({ finishedAt: null, result: 'raw' })),
    ).toMatchObject({ finishedAt: null, result: null });
    expect(
      PrismaInvocationAttemptMapper.toDomain(attemptRow({ result: null })),
    ).toMatchObject({ result: null });
  });

  it('maps canonical attempt state to Prisma create data', () => {
    const create = PrismaInvocationAttemptMapper.toCreate(attemptDomain());

    expect(create.startedAt).toEqual(new Date(100));
    expect(create.finishedAt).toEqual(new Date(150));
    expect(create.result).toEqual({ ok: true });
    expect(create.createdAt).toEqual(new Date(100));
  });

  it('preserves null completion fields for an unfinished attempt', () => {
    const create = PrismaInvocationAttemptMapper.toCreate(
      attemptDomain({ finishedAt: null, result: null }),
    );

    expect(create.finishedAt).toBeNull();
    expect(create.result).toBeNull();
  });
});
