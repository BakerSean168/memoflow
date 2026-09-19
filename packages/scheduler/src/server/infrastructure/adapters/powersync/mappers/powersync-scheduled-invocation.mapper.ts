import type { InvocationAttempt, ScheduledInvocation } from '@memoflow/contracts/schedule';

export interface PowerSyncScheduledInvocationRow {
  id: string; identity_id: string; owner_type: string; owner_id: string; scheduling_key: string;
  handler_key: string; payload_version: number; payload: string | null; run_at: string;
  source_revision: string | null; retry_enabled: number | boolean; max_retries: number;
  initial_delay_ms: number; max_delay_ms: number; backoff_multiplier: number; priority: string;
  timeout_ms: number | null; status: string; attempt_count: number; next_attempt_at: string | null;
  claim_token: string | null; claim_expires_at: string | null; fencing_token: number;
  name: string | null; tags: string | null; created_at: string; updated_at: string;
}

export interface PowerSyncInvocationAttemptRow {
  id: string; identity_id: string; invocation_id: string; attempt_number: number;
  started_at: string; finished_at: string | null; outcome: string; result: string | null;
  failure_code: string | null; failure_message: string | null; failure_retryable: number | boolean | null;
  worker_id: string | null; claim_token: string | null; fencing_token: number | null; created_at: string;
}

function parseJson(value: string | null, fallback: unknown): unknown {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function bool(value: number | boolean): boolean { return value === true || value === 1; }

export class PowerSyncScheduledInvocationMapper {
  static toDomain(row: PowerSyncScheduledInvocationRow): ScheduledInvocation {
    const tags = parseJson(row.tags, []);
    return {
      id: row.id, identityId: row.identity_id, ownerType: row.owner_type, ownerId: row.owner_id,
      schedulingKey: row.scheduling_key, handlerKey: row.handler_key, payloadVersion: row.payload_version,
      payload: parseJson(row.payload, null), runAt: new Date(row.run_at).getTime(),
      sourceRevision: row.source_revision, retryPolicy: { enabled: bool(row.retry_enabled), maxRetries: row.max_retries, initialDelayMs: row.initial_delay_ms, maxDelayMs: row.max_delay_ms, backoffMultiplier: row.backoff_multiplier },
      priority: row.priority as ScheduledInvocation['priority'], timeoutMs: row.timeout_ms,
      status: row.status as ScheduledInvocation['status'], attemptCount: row.attempt_count,
      nextAttemptAt: row.next_attempt_at ? new Date(row.next_attempt_at).getTime() : null,
      claimToken: row.claim_token, claimExpiresAt: row.claim_expires_at ? new Date(row.claim_expires_at).getTime() : null,
      fencingToken: row.fencing_token, observability: { name: row.name, tags: Array.isArray(tags) ? tags.map(String) : [] },
      createdAt: new Date(row.created_at).getTime(), updatedAt: new Date(row.updated_at).getTime(),
    };
  }

  static toRow(invocation: ScheduledInvocation) {
    return {
      id: invocation.id, identity_id: invocation.identityId, owner_type: invocation.ownerType, owner_id: invocation.ownerId,
      scheduling_key: invocation.schedulingKey, handler_key: invocation.handlerKey, payload_version: invocation.payloadVersion,
      payload: JSON.stringify(invocation.payload), run_at: new Date(invocation.runAt).toISOString(),
      source_revision: invocation.sourceRevision === null ? null : String(invocation.sourceRevision),
      retry_enabled: invocation.retryPolicy.enabled ? 1 : 0, max_retries: invocation.retryPolicy.maxRetries,
      initial_delay_ms: invocation.retryPolicy.initialDelayMs, max_delay_ms: invocation.retryPolicy.maxDelayMs,
      backoff_multiplier: invocation.retryPolicy.backoffMultiplier, priority: invocation.priority, timeout_ms: invocation.timeoutMs,
      status: invocation.status, attempt_count: invocation.attemptCount,
      next_attempt_at: invocation.nextAttemptAt === null ? null : new Date(invocation.nextAttemptAt).toISOString(),
      claim_token: invocation.claimToken, claim_expires_at: invocation.claimExpiresAt === null ? null : new Date(invocation.claimExpiresAt).toISOString(),
      fencing_token: invocation.fencingToken, name: invocation.observability.name, tags: JSON.stringify(invocation.observability.tags),
      created_at: new Date(invocation.createdAt).toISOString(), updated_at: new Date(invocation.updatedAt).toISOString(),
    };
  }
}

export class PowerSyncInvocationAttemptMapper {
  static toDomain(row: PowerSyncInvocationAttemptRow): InvocationAttempt {
    const result = parseJson(row.result, null);
    return { id: row.id, identityId: row.identity_id, invocationId: row.invocation_id, attemptNumber: row.attempt_number, startedAt: new Date(row.started_at).getTime(), finishedAt: row.finished_at ? new Date(row.finished_at).getTime() : null, outcome: row.outcome as InvocationAttempt['outcome'], result: result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : null, failureCode: row.failure_code, failureMessage: row.failure_message, failureRetryable: row.failure_retryable === null ? null : bool(row.failure_retryable), workerId: row.worker_id, claimToken: row.claim_token, fencingToken: row.fencing_token, createdAt: new Date(row.created_at).getTime() };
  }

  static toRow(attempt: InvocationAttempt) {
    return { id: attempt.id, identity_id: attempt.identityId, invocation_id: attempt.invocationId, attempt_number: attempt.attemptNumber, started_at: new Date(attempt.startedAt).toISOString(), finished_at: attempt.finishedAt === null ? null : new Date(attempt.finishedAt).toISOString(), outcome: attempt.outcome, result: attempt.result === null ? null : JSON.stringify(attempt.result), failure_code: attempt.failureCode, failure_message: attempt.failureMessage, failure_retryable: attempt.failureRetryable === null ? null : attempt.failureRetryable ? 1 : 0, worker_id: attempt.workerId, claim_token: attempt.claimToken, fencing_token: attempt.fencingToken, created_at: new Date(attempt.createdAt).toISOString() };
  }
}
