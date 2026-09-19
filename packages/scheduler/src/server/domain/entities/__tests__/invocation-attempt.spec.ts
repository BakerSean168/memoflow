import { describe, expect, it } from 'vitest';
import { InvocationAttempt } from '../invocation-attempt';

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

    expect(attempt.id).toEqual(expect.any(String));
    expect(attempt.workerId).toBeNull();
    expect(attempt.claimToken).toBeNull();
    expect(attempt.fencingToken).toBeNull();
    expect(attempt.createdAt).toBe(200);
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
