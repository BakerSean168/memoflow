import { describe, expect, it } from 'vitest';
import { InvocationAttempt } from '../invocation-attempt';
import { deriveInvocationAttemptId } from '../invocation-attempt-id';

describe('InvocationAttempt', () => {
  it('starts with explicit execution ownership and an unfinished timeout placeholder', () => {
    const attempt = InvocationAttempt.start({
      id: 'attempt-1',
      identityId: 'identity-1',
      invocationId: 'invocation-1',
      attemptNumber: 2,
      startedAt: 100,
      workerId: 'worker-1',
      claimToken: 'claim-1',
      fencingToken: 3,
    });

    expect(attempt.toState()).toEqual({
      id: 'attempt-1',
      identityId: 'identity-1',
      invocationId: 'invocation-1',
      attemptNumber: 2,
      startedAt: 100,
      finishedAt: null,
      outcome: 'timeout',
      result: null,
      failureCode: null,
      failureMessage: null,
      failureRetryable: null,
      workerId: 'worker-1',
      claimToken: 'claim-1',
      fencingToken: 3,
      createdAt: 100,
    });
  });

  it('uses generated/default ownership fields when optional inputs are absent', () => {
    const attempt = InvocationAttempt.start({
      identityId: 'identity-1',
      invocationId: 'invocation-1',
      attemptNumber: 1,
      startedAt: 200,
    }).toState();

    expect(attempt.id).toBe(deriveInvocationAttemptId('invocation-1', 1));
    expect(attempt.workerId).toBeNull();
    expect(attempt.claimToken).toBeNull();
    expect(attempt.fencingToken).toBeNull();
    expect(attempt.createdAt).toBe(200);
  });

  it('derives one stable attempt id from (invocationId, attemptNumber) across writing hosts', () => {
    // #1125: the API host and the Desktop host each started attempt 1 for the
    // same invocation. They must produce the identical row identity so the
    // natural unique key converges instead of duplicating.
    const server = InvocationAttempt.start({
      identityId: 'identity-1',
      invocationId: 'invocation-1',
      attemptNumber: 1,
      startedAt: 100,
      workerId: 'api-worker',
      claimToken: 'server-claim',
      fencingToken: 1,
    }).toState();
    const desktop = InvocationAttempt.start({
      identityId: 'identity-1',
      invocationId: 'invocation-1',
      attemptNumber: 1,
      startedAt: 150,
      workerId: 'desktop-worker',
      claimToken: 'desktop-claim',
      fencingToken: 1,
    }).toState();

    expect(server.id).toEqual(desktop.id);
    expect(server.id).toEqual(expect.stringMatching(/^invocation-attempt:[0-9a-f]{64}$/));
    expect(deriveInvocationAttemptId('invocation-1', 2)).not.toEqual(server.id);
    expect(deriveInvocationAttemptId('invocation-2', 1)).not.toEqual(server.id);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid attempt number %s',
    (attemptNumber) => {
      expect(() =>
        InvocationAttempt.start({
          identityId: 'identity-1',
          invocationId: 'invocation-1',
          attemptNumber,
          startedAt: 100,
        }),
      ).toThrow(TypeError);
    },
  );

  it('finishes immutably with success result details', () => {
    const started = InvocationAttempt.start({
      id: 'attempt-1',
      identityId: 'identity-1',
      invocationId: 'invocation-1',
      attemptNumber: 1,
      startedAt: 100,
    });
    const finished = started.finish({
      outcome: 'succeeded',
      finishedAt: 150,
      result: { notificationId: 'notification-1' },
    });

    expect(started.toState().finishedAt).toBeNull();
    expect(finished.toState()).toMatchObject({
      finishedAt: 150,
      outcome: 'succeeded',
      result: { notificationId: 'notification-1' },
      failureCode: null,
      failureMessage: null,
      failureRetryable: null,
    });
  });

  it('records failure metadata and rejects finishing an already finished attempt', () => {
    const finished = InvocationAttempt.start({
      id: 'attempt-1',
      identityId: 'identity-1',
      invocationId: 'invocation-1',
      attemptNumber: 1,
      startedAt: 100,
    }).finish({
      outcome: 'retryable_failure',
      finishedAt: 180,
      failureCode: 'TEMPORARY_UNAVAILABLE',
      failureMessage: 'try again',
      failureRetryable: true,
    });

    expect(finished.toState()).toMatchObject({
      outcome: 'retryable_failure',
      result: null,
      failureCode: 'TEMPORARY_UNAVAILABLE',
      failureMessage: 'try again',
      failureRetryable: true,
    });
    expect(() => finished.finish({ outcome: 'succeeded', finishedAt: 200 })).toThrow(
      'Invocation attempt is already finished.',
    );
  });
});
