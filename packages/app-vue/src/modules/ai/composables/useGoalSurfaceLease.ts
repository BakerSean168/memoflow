import { onScopeDispose } from 'vue';
import type { WorkflowRuntimeClient } from '@memoflow/ai/client';
import type { GoalNativeAiLease } from '@memoflow/goal-contracts';

type Grant = { runId: string; token: string; fence: number; expiresAt: number };

/**
 * Per-mounted-Chat custody of the server-authoritative native Goal surface.
 * A browser tab cannot grant itself edit ownership. The grant stays in memory
 * and must be reacquired (with a new fencing generation) after refresh.
 */
export function useGoalSurfaceLease(
  runtime: Pick<WorkflowRuntimeClient, 'goalSurfaceLease'>,
  onLost: () => void,
) {
  let grant: Grant | null = null;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingClaim: { runId: string; promise: Promise<boolean> } | null = null;
  let pendingRenew: Promise<boolean> | null = null;

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function revoke(notify: boolean) {
    grant = null;
    generation++;
    clearTimer();
    pendingRenew = null;
    if (notify) onLost();
  }

  async function release(): Promise<void> {
    const previous = grant;
    revoke(false);
    if (previous) {
      try {
        await runtime.goalSurfaceLease({
          action: 'release',
          runId: previous.runId,
          token: previous.token,
          fence: previous.fence,
        });
      } catch {
        // TTL is the fallback when network teardown or window unload interrupts release.
      }
    }
  }

  function schedule() {
    clearTimer();
    if (!grant) return;
    const expectedGeneration = generation;
    const delay = Math.max(1000, Math.min(8_000, grant.expiresAt - Date.now() - 5_000));
    timer = setTimeout(async () => {
      timer = null;
      if (expectedGeneration !== generation || !grant) return;
      await verify(grant.runId);
    }, delay);
  }

  async function verify(runId: string): Promise<boolean> {
    if (!grant || grant.runId !== runId) return false;
    if (pendingRenew) return pendingRenew;
    const current = grant;
    const stamp = generation;
    const promise = (async () => {
      try {
        const result = await runtime.goalSurfaceLease({
          action: 'renew',
          runId,
          token: current.token,
          fence: current.fence,
        });
        if (stamp !== generation || grant !== current) return false;
        if (result.status !== 'renewed') {
          revoke(true);
          return false;
        }
        current.expiresAt = result.expiresAt;
        schedule();
        return true;
      } catch {
        // Fail closed on network partition; the old window must not keep applying
        // native mutations after another window might have claimed a new fence.
        if (stamp === generation && grant === current) revoke(true);
        return false;
      }
    })();
    pendingRenew = promise;
    try {
      return await promise;
    } finally {
      if (pendingRenew === promise) pendingRenew = null;
    }
  }

  async function claim(runId: string): Promise<boolean> {
    if (grant?.runId === runId) return verify(runId);
    if (pendingClaim?.runId === runId) return pendingClaim.promise;
    if (grant) await release();
    const stamp = ++generation;
    const promise = (async () => {
      const result = await runtime.goalSurfaceLease({ action: 'claim', runId });
      if (result.status !== 'claimed') return false;
      if (stamp !== generation) {
        // This component retired while the async claim was in transit.
        void runtime
          .goalSurfaceLease({
            action: 'release',
            runId,
            token: result.token,
            fence: result.fence,
          })
          .catch(() => undefined);
        return false;
      }
      grant = { runId, token: result.token, fence: result.fence, expiresAt: result.expiresAt };
      schedule();
      return true;
    })();
    pendingClaim = { runId, promise };
    try {
      return await promise;
    } finally {
      if (pendingClaim?.promise === promise) pendingClaim = null;
    }
  }

  function currentGrant(runId: string): GoalNativeAiLease | null {
    const active = grant;
    if (!active || active.runId !== runId || active.expiresAt <= Date.now()) return null;
    // A detached capability snapshot, never the mutable heartbeat state.
    return { runId: active.runId, token: active.token, fence: active.fence };
  }

  onScopeDispose(() => {
    void release();
  });

  return {
    claim,
    verify,
    release,
    currentGrant,
    isHeld: (runId: string) => grant?.runId === runId,
  };
}
