import type { InvocationAttempt as PrismaAttempt, ScheduledInvocation as PrismaInvocation } from '@memoflow/database';
import type { InvocationAttempt, ScheduledInvocation } from '@memoflow/contracts/schedule';

function jsonValue(value: unknown): unknown {
  return value === undefined ? null : value;
}

function sourceRevision(value: unknown): number | string | null {
  return typeof value === 'number' || typeof value === 'string' ? value : null;
}

export class PrismaScheduledInvocationMapper {
  static toDomain(row: PrismaInvocation): ScheduledInvocation {
    return {
      id: row.id,
      identityId: row.identityId,
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      schedulingKey: row.schedulingKey,
      handlerKey: row.handlerKey,
      payloadVersion: row.payloadVersion,
      payload: row.payload,
      runAt: row.runAt.getTime(),
      sourceRevision: sourceRevision(row.sourceRevision),
      retryPolicy: {
        enabled: row.retryEnabled,
        maxRetries: row.maxRetries,
        initialDelayMs: row.initialDelayMs,
        maxDelayMs: row.maxDelayMs,
        backoffMultiplier: row.backoffMultiplier,
      },
      priority: row.priority as ScheduledInvocation['priority'],
      timeoutMs: row.timeoutMs,
      status: row.status as ScheduledInvocation['status'],
      attemptCount: row.attemptCount,
      nextAttemptAt: row.nextAttemptAt?.getTime() ?? null,
      claimToken: row.claimToken,
      claimExpiresAt: row.claimExpiresAt?.getTime() ?? null,
      fencingToken: row.fencingToken,
      observability: { name: row.name, tags: Array.isArray(row.tags) ? row.tags.map(String) : [] },
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  }

  static toCreate(invocation: ScheduledInvocation) {
    return {
      id: invocation.id,
      identityId: invocation.identityId,
      ownerType: invocation.ownerType,
      ownerId: invocation.ownerId,
      schedulingKey: invocation.schedulingKey,
      handlerKey: invocation.handlerKey,
      payloadVersion: invocation.payloadVersion,
      payload: jsonValue(invocation.payload),
      runAt: new Date(invocation.runAt),
      sourceRevision: jsonValue(invocation.sourceRevision),
      retryEnabled: invocation.retryPolicy.enabled,
      maxRetries: invocation.retryPolicy.maxRetries,
      initialDelayMs: invocation.retryPolicy.initialDelayMs,
      maxDelayMs: invocation.retryPolicy.maxDelayMs,
      backoffMultiplier: invocation.retryPolicy.backoffMultiplier,
      priority: invocation.priority,
      timeoutMs: invocation.timeoutMs,
      status: invocation.status,
      attemptCount: invocation.attemptCount,
      nextAttemptAt: invocation.nextAttemptAt === null ? null : new Date(invocation.nextAttemptAt),
      claimToken: invocation.claimToken,
      claimExpiresAt: invocation.claimExpiresAt === null ? null : new Date(invocation.claimExpiresAt),
      fencingToken: invocation.fencingToken,
      name: invocation.observability.name,
      tags: invocation.observability.tags,
      createdAt: new Date(invocation.createdAt),
      updatedAt: new Date(invocation.updatedAt),
    };
  }
}

export class PrismaInvocationAttemptMapper {
  static toDomain(row: PrismaAttempt): InvocationAttempt {
    return {
      id: row.id,
      identityId: row.identityId,
      invocationId: row.invocationId,
      attemptNumber: row.attemptNumber,
      startedAt: row.startedAt.getTime(),
      finishedAt: row.finishedAt?.getTime() ?? null,
      outcome: row.outcome as InvocationAttempt['outcome'],
      result: row.result && typeof row.result === 'object' ? row.result as Record<string, unknown> : null,
      failureCode: row.failureCode,
      failureMessage: row.failureMessage,
      failureRetryable: row.failureRetryable,
      workerId: row.workerId,
      claimToken: row.claimToken,
      fencingToken: row.fencingToken,
      createdAt: row.createdAt.getTime(),
    };
  }

  static toCreate(attempt: InvocationAttempt) {
    return {
      id: attempt.id,
      identityId: attempt.identityId,
      invocationId: attempt.invocationId,
      attemptNumber: attempt.attemptNumber,
      startedAt: new Date(attempt.startedAt),
      finishedAt: attempt.finishedAt === null ? null : new Date(attempt.finishedAt),
      outcome: attempt.outcome,
      result: jsonValue(attempt.result),
      failureCode: attempt.failureCode,
      failureMessage: attempt.failureMessage,
      failureRetryable: attempt.failureRetryable,
      workerId: attempt.workerId,
      claimToken: attempt.claimToken,
      fencingToken: attempt.fencingToken,
      createdAt: new Date(attempt.createdAt),
    };
  }
}
