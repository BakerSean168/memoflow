import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IScheduledInvocationRepository } from '../../domain/repositories/i-scheduled-invocation-repository';
import { createScheduledInvocationRuntimeContribution } from './scheduled-invocation.runtime';

function emptyRepository() {
  return {
    recoverExpiredClaims: vi.fn().mockResolvedValue(0),
    findRunnable: vi.fn().mockResolvedValue([]),
  } as unknown as IScheduledInvocationRepository & {
    recoverExpiredClaims: ReturnType<typeof vi.fn>;
    findRunnable: ReturnType<typeof vi.fn>;
  };
}

describe('ScheduledInvocation runtime lease/recovery', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays standby without the host lease, then promotes and reloads canonical work', async () => {
    vi.useFakeTimers();
    const repository = emptyRepository();
    const acquire = vi
      .fn()
      .mockResolvedValueOnce({ acquired: false, ownerToken: 'other-host' })
      .mockResolvedValueOnce({ acquired: true, ownerToken: 'this-host' });
    const release = vi.fn().mockResolvedValue(undefined);
    const leaseCoordinator = { acquire, release };
    const runtime = createScheduledInvocationRuntimeContribution({
      repository,
      handlerRegistry: { execute: vi.fn() },
      leaseCoordinator: leaseCoordinator as never,
      leaseRetryIntervalMs: 250,
      rescanIntervalMs: 250,
    });

    await runtime.start();
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(repository.findRunnable).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(2));
    expect(repository.recoverExpiredClaims).toHaveBeenCalledTimes(1);
    expect(repository.findRunnable).toHaveBeenCalledTimes(1);

    await runtime.stop();
    expect(release).toHaveBeenCalledWith(expect.any(String), 'this-host');
  });

  it('reloads runnable work immediately when the lease is acquired at startup', async () => {
    const repository = emptyRepository();
    const acquire = vi.fn().mockResolvedValue({ acquired: true, ownerToken: 'owner-1' });
    const release = vi.fn().mockResolvedValue(undefined);
    const runtime = createScheduledInvocationRuntimeContribution({
      repository,
      handlerRegistry: { execute: vi.fn() },
      leaseCoordinator: { acquire, release } as never,
      rescanIntervalMs: 60_000,
    });

    await runtime.start();
    expect(repository.recoverExpiredClaims).toHaveBeenCalledTimes(1);
    expect(repository.findRunnable).toHaveBeenCalledTimes(1);
    await runtime.stop();
    expect(release).toHaveBeenCalledWith(expect.any(String), 'owner-1');
  });
});
