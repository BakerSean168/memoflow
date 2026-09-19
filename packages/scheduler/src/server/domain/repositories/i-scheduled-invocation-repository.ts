import type {
  InvocationAttempt,
  ScheduledInvocation,
  ScheduledInvocationStatus,
  ScheduledIntent,
  SchedulingOwner,
  SchedulingReconcileReceipt,
} from '@memoflow/contracts/schedule';

export interface ScheduledInvocationClaim {
  readonly invocation: ScheduledInvocation;
  readonly attempt: InvocationAttempt;
}

export interface ScheduledInvocationCompleteInput {
  readonly invocationId: string;
  readonly identityId: string;
  readonly claimToken: string;
  readonly fencingToken: number;
  readonly attemptNumber: number;
  readonly outcome: InvocationAttempt['outcome'];
  readonly status: ScheduledInvocationStatus;
  readonly nextAttemptAt: number | null;
  readonly finishedAt: number;
  readonly result?: Record<string, unknown> | null;
  readonly failureCode?: string | null;
  readonly failureMessage?: string | null;
  readonly failureRetryable?: boolean | null;
}

export interface IScheduledInvocationRepository {
  findById(id: string): Promise<ScheduledInvocation | null>;
  findByIdForIdentity(identityId: string, id: string): Promise<ScheduledInvocation | null>;
  findByOwner(owner: SchedulingOwner): Promise<ScheduledInvocation[]>;
  listForIdentity(
    identityId: string,
    options?: {
      readonly ownerType?: string;
      readonly ownerId?: string;
      readonly status?: ScheduledInvocationStatus;
      readonly dueBefore?: number;
      readonly limit?: number;
    },
  ): Promise<ScheduledInvocation[]>;
  listOwnersByType(ownerType: string): Promise<SchedulingOwner[]>;
  findRunnable(limit?: number): Promise<ScheduledInvocation[]>;
  findDue(now: number, limit?: number): Promise<ScheduledInvocation[]>;
  save(invocation: ScheduledInvocation): Promise<void>;
  supersedeStale(owner: SchedulingOwner, keepSchedulingKeys: readonly string[]): Promise<number>;
  claimAndStart(input: {
    invocationId: string;
    identityId: string;
    claimToken: string;
    claimExpiresAt: number;
    now: number;
    workerId?: string | null;
  }): Promise<ScheduledInvocationClaim | null>;
  completeAttempt(input: ScheduledInvocationCompleteInput): Promise<boolean>;
  recoverExpiredClaims(now: number, limit?: number): Promise<number>;
  appendSchedulingReconcileReceipt(receipt: SchedulingReconcileReceipt): Promise<void>;
  withTransaction<T>(fn: (repository: IScheduledInvocationRepository) => Promise<T>): Promise<T>;
}

export type ScheduledInvocationDesired = ScheduledIntent;
