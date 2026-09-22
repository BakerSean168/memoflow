import type {
  InvocationAttemptOutcome,
  ScheduledInvocation as ScheduledInvocationContract,
  ScheduledInvocationRetryPolicy,
  ScheduledInvocationStatus,
  SchedulingOwner,
  SchedulingPriority,
} from '@memoflow/contracts/schedule';
import { generateUUID } from '@memoflow/utils/shared';

export interface ScheduledInvocationState extends ScheduledInvocationContract {}

const ALLOWED_TRANSITIONS: Record<ScheduledInvocationStatus, readonly ScheduledInvocationStatus[]> = {
  pending: ['running', 'superseded'],
  running: ['succeeded', 'skipped', 'retry_wait', 'failed', 'dead_letter', 'superseded'],
  retry_wait: ['running', 'superseded'],
  succeeded: [],
  skipped: [],
  failed: [],
  dead_letter: [],
  superseded: [],
};

export class ScheduledInvocationTransitionError extends Error {
  constructor(
    public readonly from: ScheduledInvocationStatus,
    public readonly to: ScheduledInvocationStatus,
  ) {
    super(`Invalid scheduled invocation transition: ${from} -> ${to}`);
    this.name = 'ScheduledInvocationTransitionError';
  }
}

export class ScheduledInvocation {
  private constructor(private state: ScheduledInvocationState) {}

  static create(params: {
    id?: string;
    identityId: string;
    owner: SchedulingOwner;
    schedulingKey: string;
    handlerKey: string;
    payloadVersion: number;
    payload: unknown;
    runAt: number;
    sourceRevision?: number | string | null;
    retryPolicy: ScheduledInvocationRetryPolicy;
    priority: SchedulingPriority;
    timeoutMs?: number | null;
    name?: string | null;
    tags?: readonly string[];
    now?: number;
  }): ScheduledInvocation {
    const now = params.now ?? Date.now();
    return new ScheduledInvocation({
      id: params.id ?? generateUUID(),
      identityId: params.identityId,
      ownerType: params.owner.type,
      ownerId: params.owner.id,
      schedulingKey: params.schedulingKey,
      handlerKey: params.handlerKey,
      payloadVersion: params.payloadVersion,
      payload: params.payload,
      runAt: params.runAt,
      sourceRevision: params.sourceRevision ?? null,
      retryPolicy: params.retryPolicy,
      priority: params.priority,
      timeoutMs: params.timeoutMs ?? null,
      status: 'pending',
      attemptCount: 0,
      nextAttemptAt: null,
      claimToken: null,
      claimExpiresAt: null,
      fencingToken: 0,
      observability: {
        name: params.name ?? null,
        tags: [...(params.tags ?? [])],
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  static load(state: ScheduledInvocationState): ScheduledInvocation {
    return new ScheduledInvocation({
      ...state,
      observability: {
        name: state.observability.name,
        tags: [...state.observability.tags],
      },
    });
  }

  get id(): string { return this.state.id; }
  get identityId(): string { return this.state.identityId; }
  get owner(): SchedulingOwner {
    return { identityId: this.identityId, type: this.state.ownerType, id: this.state.ownerId };
  }
  get ownerType(): string { return this.state.ownerType; }
  get ownerId(): string { return this.state.ownerId; }
  get schedulingKey(): string { return this.state.schedulingKey; }
  get handlerKey(): string { return this.state.handlerKey; }
  get payloadVersion(): number { return this.state.payloadVersion; }
  get payload(): unknown { return this.state.payload; }
  get runAt(): number { return this.state.runAt; }
  get sourceRevision(): number | string | null { return this.state.sourceRevision; }
  get retryPolicy(): ScheduledInvocationRetryPolicy { return this.state.retryPolicy; }
  get priority(): SchedulingPriority { return this.state.priority; }
  get timeoutMs(): number | null { return this.state.timeoutMs; }
  get status(): ScheduledInvocationStatus { return this.state.status; }
  get attemptCount(): number { return this.state.attemptCount; }
  get nextAttemptAt(): number | null { return this.state.nextAttemptAt; }
  get claimToken(): string | null { return this.state.claimToken; }
  get claimExpiresAt(): number | null { return this.state.claimExpiresAt; }
  get fencingToken(): number { return this.state.fencingToken; }
  get observability(): ScheduledInvocationContract['observability'] { return this.state.observability; }
  get createdAt(): number { return this.state.createdAt; }
  get updatedAt(): number { return this.state.updatedAt; }

  toState(): ScheduledInvocationState {
    return {
      ...this.state,
      observability: { ...this.state.observability, tags: [...this.state.observability.tags] },
    };
  }

  toHandlerContext() {
    return {
      identityId: this.identityId,
      owner: this.owner,
      schedulingKey: this.schedulingKey,
      handlerKey: this.handlerKey,
      runAt: this.runAt,
      payloadVersion: this.payloadVersion,
      payload: this.payload,
      ...(this.sourceRevision === null ? {} : { sourceRevision: this.sourceRevision }),
    };
  }

  applyDesired(params: {
    handlerKey: string;
    payloadVersion: number;
    payload: unknown;
    runAt: number;
    sourceRevision?: number | string | null;
    retryPolicy: ScheduledInvocationRetryPolicy;
    priority: SchedulingPriority;
    timeoutMs?: number | null;
    name?: string | null;
    tags?: readonly string[];
    now?: number;
  }): void {
    if (
      this.status === 'succeeded' ||
      this.status === 'skipped' ||
      this.status === 'failed' ||
      this.status === 'dead_letter'
    ) {
      throw new ScheduledInvocationTransitionError(this.status, 'pending');
    }

    // `superseded` is only an owner-reconcile tombstone. If that stable
    // business identity becomes desired again, re-arm it while preserving
    // attempt/fencing history; execution-terminal outcomes remain immutable.
    this.state = {
      ...this.state,
      handlerKey: params.handlerKey,
      payloadVersion: params.payloadVersion,
      payload: params.payload,
      runAt: params.runAt,
      sourceRevision: params.sourceRevision ?? null,
      retryPolicy: params.retryPolicy,
      priority: params.priority,
      timeoutMs: params.timeoutMs ?? null,
      observability: { name: params.name ?? null, tags: [...(params.tags ?? [])] },
      status: this.status === 'running' ? this.status : 'pending',
      nextAttemptAt: null,
      claimToken: this.status === 'running' ? this.claimToken : null,
      claimExpiresAt: this.status === 'running' ? this.claimExpiresAt : null,
      updatedAt: params.now ?? Date.now(),
    };
  }

  transitionTo(status: ScheduledInvocationStatus, now = Date.now()): void {
    if (!ALLOWED_TRANSITIONS[this.status].includes(status)) {
      throw new ScheduledInvocationTransitionError(this.status, status);
    }
    this.state = { ...this.state, status, updatedAt: now };
  }

  claim(claimToken: string, claimExpiresAt: number, now = Date.now()): number {
    if (this.status !== 'pending' && this.status !== 'retry_wait') {
      throw new ScheduledInvocationTransitionError(this.status, 'running');
    }
    const dueAt = this.nextAttemptAt ?? this.runAt;
    if (dueAt > now) throw new Error(`Scheduled invocation ${this.id} is not due.`);
    this.state = {
      ...this.state,
      status: 'running',
      attemptCount: this.attemptCount + 1,
      nextAttemptAt: null,
      claimToken,
      claimExpiresAt,
      fencingToken: this.fencingToken + 1,
      updatedAt: now,
    };
    return this.attemptCount;
  }

  complete(
    outcome: InvocationAttemptOutcome,
    nextAttemptAt: number | null,
    now = Date.now(),
  ): void {
    const status: ScheduledInvocationStatus =
      outcome === 'succeeded' ? 'succeeded' :
      outcome === 'skipped' ? 'skipped' :
      outcome === 'retryable_failure' && nextAttemptAt !== null ? 'retry_wait' :
      outcome === 'retryable_failure' ? 'dead_letter' :
      outcome === 'timeout' && nextAttemptAt !== null ? 'retry_wait' :
      outcome === 'timeout' ? 'dead_letter' :
      outcome === 'permanent_failure' ? 'failed' : 'failed';
    this.transitionTo(status, now);
    this.state = {
      ...this.state,
      nextAttemptAt: status === 'retry_wait' ? nextAttemptAt : null,
      claimToken: null,
      claimExpiresAt: null,
      updatedAt: now,
    };
  }
}

export function isTerminalScheduledInvocationStatus(status: ScheduledInvocationStatus): boolean {
  return status === 'succeeded' || status === 'skipped' || status === 'failed' || status === 'dead_letter' || status === 'superseded';
}
