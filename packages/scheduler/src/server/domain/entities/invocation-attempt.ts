import type { InvocationAttempt as InvocationAttemptContract, InvocationAttemptOutcome } from '@memoflow/contracts/schedule';
import { generateUUID } from '@memoflow/utils/shared';

export type InvocationAttemptState = InvocationAttemptContract;

export class InvocationAttempt {
  private constructor(private readonly state: InvocationAttemptState) {}

  static start(input: {
    identityId: string;
    invocationId: string;
    attemptNumber: number;
    startedAt?: number;
    workerId?: string | null;
    claimToken?: string | null;
    fencingToken?: number | null;
    id?: string;
  }): InvocationAttempt {
    const startedAt = input.startedAt ?? Date.now();
    if (!Number.isSafeInteger(input.attemptNumber) || input.attemptNumber < 1) {
      throw new TypeError('attemptNumber must be a positive safe integer.');
    }
    return new InvocationAttempt({
      id: input.id ?? generateUUID(), identityId: input.identityId,
      invocationId: input.invocationId, attemptNumber: input.attemptNumber,
      startedAt, finishedAt: null, outcome: 'timeout', result: null,
      failureCode: null, failureMessage: null, failureRetryable: null,
      workerId: input.workerId ?? null, claimToken: input.claimToken ?? null,
      fencingToken: input.fencingToken ?? null, createdAt: startedAt,
    });
  }

  finish(input: {
    outcome: InvocationAttemptOutcome;
    finishedAt?: number;
    result?: Record<string, unknown> | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    failureRetryable?: boolean | null;
  }): InvocationAttempt {
    if (this.state.finishedAt !== null) throw new Error('Invocation attempt is already finished.');
    return new InvocationAttempt({
      ...this.state, finishedAt: input.finishedAt ?? Date.now(), outcome: input.outcome,
      result: input.result ?? null, failureCode: input.failureCode ?? null,
      failureMessage: input.failureMessage ?? null, failureRetryable: input.failureRetryable ?? null,
    });
  }

  toState(): InvocationAttemptState { return { ...this.state }; }
}
