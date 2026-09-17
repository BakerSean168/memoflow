import type {
  InvocationAttempt,
  InvocationAttemptDiagnostic,
  ScheduledInvocation,
  ScheduledInvocationDiagnostic,
} from '@memoflow/contracts/schedule';

export function toInvocationAttemptDiagnostic(
  attempt: InvocationAttempt | null,
): InvocationAttemptDiagnostic | null {
  if (!attempt) return null;
  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    outcome: attempt.outcome,
    failure: {
      code: attempt.failureCode,
      message: attempt.failureMessage,
      retryable: attempt.failureRetryable,
    },
    workerId: attempt.workerId,
  };
}

export function toScheduledInvocationDiagnostic(
  invocation: ScheduledInvocation,
  lastAttempt: InvocationAttempt | null,
): ScheduledInvocationDiagnostic {
  return {
    id: invocation.id,
    owner: {
      identityId: invocation.identityId,
      type: invocation.ownerType,
      id: invocation.ownerId,
    },
    schedulingKey: invocation.schedulingKey,
    handlerKey: invocation.handlerKey,
    runAt: invocation.runAt,
    status: invocation.status,
    nextAttemptAt: invocation.nextAttemptAt,
    attemptCount: invocation.attemptCount,
    sourceRevision: invocation.sourceRevision,
    executionPolicy: {
      priority: invocation.priority,
      timeoutMs: invocation.timeoutMs,
      retryPolicy: invocation.retryPolicy,
    },
    observability: invocation.observability,
    payloadVersion: invocation.payloadVersion,
    lastAttempt: toInvocationAttemptDiagnostic(lastAttempt),
    createdAt: invocation.createdAt,
    updatedAt: invocation.updatedAt,
  };
}
