import type { Instant } from '../../primitives';

/** Neutral owner of one complete desired scheduling set. */
export interface SchedulingOwner {
  readonly identityId: string;
  readonly type: string;
  readonly id: string;
}

export type SchedulingPriority = 'low' | 'normal' | 'high' | 'urgent';

/** Retry policy expressed without leaking the legacy ScheduleTask aggregate. */
export interface SchedulingRetryPolicy {
  readonly enabled?: boolean;
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
}

/** Desired future invocation owned by a business projector. */
export interface ScheduledIntent<TPayload = unknown> {
  readonly schedulingKey: string;
  readonly handlerKey: string;
  readonly runAt: Instant;
  readonly payloadVersion: number;
  readonly payload: TPayload;
  readonly sourceRevision?: number | string;
  readonly retryPolicy?: SchedulingRetryPolicy;
  readonly priority?: SchedulingPriority;
  readonly timeoutMs?: number | null;
  readonly observability?: {
    readonly name?: string;
    readonly tags?: readonly string[];
  };
}

export type SchedulingReconcileFailureCode =
  | 'INVALID_OWNER'
  | 'INVALID_INTENT'
  | 'DUPLICATE_SCHEDULING_KEY'
  | 'PERSISTED_KEY_COLLISION'
  | 'TRANSACTION_FAILED';

export interface SchedulingReconcileFailure {
  readonly code: SchedulingReconcileFailureCode;
  readonly message: string;
  readonly retryable: boolean;
}

/** Result of atomically reconciling one owner's complete desired set. */
export interface SchedulingReconcileReceipt {
  readonly operationId: string;
  readonly owner: SchedulingOwner;
  readonly status: 'succeeded' | 'failed';
  readonly desiredCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly deletedCount: number;
  readonly unchangedCount: number;
  readonly startedAt: Instant;
  readonly finishedAt: Instant;
  readonly failure?: SchedulingReconcileFailure;
}

export interface SchedulingPort {
  reconcile(
    owner: SchedulingOwner,
    desired: readonly ScheduledIntent[],
  ): Promise<SchedulingReconcileReceipt>;

  removeOwner(owner: SchedulingOwner): Promise<SchedulingReconcileReceipt>;
}

function encodeSchedulingKeySegment(
  segment: string,
  label = 'Scheduling key segment',
  maxLength = 256,
): string {
  if (typeof segment !== 'string' || segment.length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  if (segment !== segment.trim()) {
    throw new TypeError(`${label} must not contain leading or trailing whitespace.`);
  }
  if (segment.length > maxLength) {
    throw new TypeError(`${label} must be at most ${maxLength} characters.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(segment)) {
    throw new TypeError(`${label} must not contain control characters.`);
  }
  return `${segment.length}:${segment}`;
}

/**
 * Collision-free canonical identity for one desired scheduled invocation.
 *
 * This belongs to the neutral contract seam rather than Scheduler
 * infrastructure because business projectors must be able to construct stable
 * intent identity without importing the legacy scheduling engine.
 */
export function buildSchedulingKey(...segments: readonly string[]): string {
  if (segments.length === 0) {
    throw new TypeError('At least one scheduling key segment is required.');
  }
  const key = `sk:v1:${segments.map((segment) => encodeSchedulingKeySegment(segment)).join(':')}`;
  if (key.length > 512) {
    throw new TypeError('schedulingKey must be at most 512 characters.');
  }
  return key;
}

/** Stable storage/lock key for one complete owner desired set. */
export function buildSchedulingOwnerKey(owner: SchedulingOwner): string {
  if (!owner || typeof owner !== 'object') {
    throw new TypeError('Scheduling owner is required.');
  }
  return `owner:v1:${encodeSchedulingKeySegment(owner.identityId, 'Scheduling owner identityId', 256)}:${encodeSchedulingKeySegment(owner.type, 'Scheduling owner type', 128)}:${encodeSchedulingKeySegment(owner.id, 'Scheduling owner id', 256)}`;
}

export interface ScheduledInvocationContext<TPayload = unknown> {
  readonly identityId: string;
  readonly owner: SchedulingOwner;
  readonly schedulingKey: string;
  readonly handlerKey: string;
  readonly runAt: Instant;
  readonly payloadVersion: number;
  readonly payload: TPayload;
  readonly sourceRevision?: number | string;
}

export type ScheduledHandlerFailureCode =
  | 'UNKNOWN_HANDLER'
  | 'UNSUPPORTED_PAYLOAD_VERSION'
  | 'PAYLOAD_VALIDATION_FAILED'
  | 'HANDLER_EXECUTION_FAILED'
  | string;

export interface ScheduledHandlerFailure {
  readonly code: ScheduledHandlerFailureCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type ScheduledHandlerResult =
  | {
      readonly status: 'succeeded';
      readonly result?: Record<string, unknown>;
    }
  | {
      readonly status: 'skipped';
      readonly reason: string;
      readonly result?: Record<string, unknown>;
    }
  | {
      readonly status: 'retryable' | 'failed' | 'dead_letter';
      readonly failure: ScheduledHandlerFailure;
      readonly result?: Record<string, unknown>;
    };

export interface ScheduledHandler<TPayload = unknown> {
  execute(context: ScheduledInvocationContext<TPayload>): Promise<ScheduledHandlerResult>;
}

/** Registration owns payload versioning/validation; the registry owns dispatch only. */
export interface ScheduledHandlerRegistration<TPayload = unknown> {
  readonly handlerKey: string;
  readonly payloadVersion: number;
  readonly validatePayload: (payload: unknown) => TPayload;
  readonly handler: ScheduledHandler<TPayload>;
}

export type ScheduledInvocationStatus =
  | 'pending'
  | 'running'
  | 'retry_wait'
  | 'succeeded'
  | 'skipped'
  | 'failed'
  | 'dead_letter'
  | 'superseded';

export type InvocationAttemptOutcome =
  | 'succeeded'
  | 'skipped'
  | 'retryable_failure'
  | 'permanent_failure'
  | 'timeout';

export interface ScheduledInvocationRetryPolicy {
  readonly enabled: boolean;
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
}

export interface ScheduledInvocation {
  readonly id: string;
  readonly identityId: string;
  readonly ownerType: string;
  readonly ownerId: string;
  readonly schedulingKey: string;
  readonly handlerKey: string;
  readonly payloadVersion: number;
  readonly payload: unknown;
  readonly runAt: Instant;
  readonly sourceRevision: number | string | null;
  readonly retryPolicy: ScheduledInvocationRetryPolicy;
  readonly priority: SchedulingPriority;
  readonly timeoutMs: number | null;
  readonly status: ScheduledInvocationStatus;
  readonly attemptCount: number;
  readonly nextAttemptAt: Instant | null;
  readonly claimToken: string | null;
  readonly claimExpiresAt: Instant | null;
  readonly fencingToken: number;
  readonly observability: {
    readonly name: string | null;
    readonly tags: readonly string[];
  };
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export interface InvocationAttempt {
  readonly id: string;
  readonly identityId: string;
  readonly invocationId: string;
  readonly attemptNumber: number;
  readonly startedAt: Instant;
  readonly finishedAt: Instant | null;
  readonly outcome: InvocationAttemptOutcome;
  readonly result: Record<string, unknown> | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly failureRetryable: boolean | null;
  readonly workerId: string | null;
  readonly claimToken: string | null;
  readonly fencingToken: number | null;
  readonly createdAt: Instant;
}
