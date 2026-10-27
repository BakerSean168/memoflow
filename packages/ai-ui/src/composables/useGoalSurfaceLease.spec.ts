import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
import { effectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowRuntimeClient } from '@memoflow/ai-client';
import { useGoalSurfaceLease } from './useGoalSurfaceLease';

afterEach(() => {
  vi.useRealTimers();
});

describe('Goal native panel server lease', () => {
  function setup() {
    let current: { token: string; fence: number; expiresAt: number } | null = null;
    let generation = 0;
    const goalSurfaceLease = vi.fn(
      async (request: { action: string; token?: string; fence?: number }) => {
        if (request.action === 'claim') {
          if (current && current.expiresAt > Date.now()) return { status: 'busy' as const };
          current = {
            token: `00000000-0000-4000-8000-${String(++generation).padStart(12, '0')}`,
            fence: generation,
            expiresAt: Date.now() + 30_000,
          };
          return { status: 'claimed' as const, ...current };
        }
        if (
          !current ||
          request.token !== current.token ||
          request.fence !== current.fence ||
          (request.action === 'renew' && current.expiresAt <= Date.now())
        ) {
          return { status: 'lost' as const };
        }
        if (request.action === 'renew') {
          current.expiresAt = Date.now() + 30_000;
          return { status: 'renewed' as const, expiresAt: current.expiresAt };
        }
        current = null;
        return { status: 'released' as const };
      },
    );
    const runtime = { goalSurfaceLease } as unknown as WorkflowRuntimeClient;
    function window() {
      const scope = effectScope();
      const onLost = vi.fn();
      const lease = scope.run(() => useGoalSurfaceLease(runtime, onLost))!;
      return { ...lease, scope, onLost };
    }
    return { window, goalSurfaceLease };
  }

  it('allows only one active window and hands over only after release', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const server = setup();
    const first = server.window();
    const second = server.window();
    expect(await first.claim('run-1')).toBe(true);
    expect(await second.claim('run-1')).toBe(false);
    expect(await first.verify('run-1')).toBe(true);
    await first.release();
    expect(await second.claim('run-1')).toBe(true);
    first.scope.stop();
    second.scope.stop();
  });

  it('fences an old window after expiry and prevents any further AI work', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const server = setup();
    const first = server.window();
    const second = server.window();
    expect(await first.claim('run-1')).toBe(true);
    // Simulate a paused/throttled tab: do not run the client heartbeat.
    vi.setSystemTime(32_000);
    expect(await second.claim('run-1')).toBe(true);
    expect(await first.verify('run-1')).toBe(false);
    expect(first.onLost).toHaveBeenCalledOnce();
    expect(await first.verify('run-1')).toBe(false);
    first.scope.stop();
    second.scope.stop();
  });

  it('revokes local authority and stops renewal when release is lost, allowing the peer after TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const server = setup();
    const first = server.window();
    const peer = server.window();
    try {
      expect(await first.claim('run-1')).toBe(true);
      const initial = first.currentGrant('run-1');
      server.goalSurfaceLease.mockRejectedValueOnce(new Error('release response lost'));
      await expect(first.release()).resolves.toBeUndefined();
      expect(first.currentGrant('run-1')).toBeNull();
      expect(await first.verify('run-1')).toBe(false);
      expect(first.onLost).not.toHaveBeenCalled();
      expect(await peer.claim('run-1')).toBe(false);
      await vi.advanceTimersByTimeAsync(31_000);
      expect(
        server.goalSurfaceLease.mock.calls.filter(([request]) => request.action === 'renew'),
      ).toHaveLength(0);
      expect(await peer.claim('run-1')).toBe(true);
      expect(peer.currentGrant('run-1')!.fence).toBeGreaterThan(initial!.fence);
    } finally {
      first.scope.stop();
      peer.scope.stop();
    }
  });

  it('fails closed on network loss, and late claim responses cannot resurrect a retired view', async () => {
    vi.useFakeTimers();
    const server = setup();
    const first = server.window();
    expect(await first.claim('run-1')).toBe(true);
    server.goalSurfaceLease.mockRejectedValueOnce(new Error('offline'));
    expect(await first.verify('run-1')).toBe(false);
    expect(first.onLost).toHaveBeenCalledOnce();
    first.scope.stop();

    let resolve!: (value: unknown) => void;
    const delayed = new Promise((r) => {
      resolve = r;
    });
    const nextRuntime = {
      goalSurfaceLease: vi
        .fn()
        .mockReturnValueOnce(delayed)
        .mockResolvedValue({ status: 'released' }),
    } as unknown as WorkflowRuntimeClient;
    const scope = effectScope();
    const delayedLease = scope.run(() => useGoalSurfaceLease(nextRuntime, vi.fn()))!;
    const claim = delayedLease.claim('run-2');
    scope.stop();
    resolve({
      status: 'claimed',
      token: '11111111-1111-4111-8111-111111111111',
      fence: 10,
      expiresAt: 60_000,
    });
    expect(await claim).toBe(false);
    await Promise.resolve();
    expect(nextRuntime.goalSurfaceLease).toHaveBeenCalledWith({
      action: 'release',
      runId: 'run-2',
      token: '11111111-1111-4111-8111-111111111111',
      fence: 10,
    });
  });
});
