import { describe, expect, it, vi } from 'vitest';
import { asInstant } from '@memoflow/time';
import { ProtocolDefinition, ProtocolSession } from '../../domain/routine';
import { createInMemoryProtocolSessionStore } from './protocol-session-store.in-memory';
import { createProtocolSessionRuntime } from './protocol-session.runtime';
import type { ProtocolBreakCreditRuntime } from '../protocol-break-credit';

const minute = 60_000;
const t0 = Date.parse('2026-08-27T00:00:00.000Z');

function create5010(): ProtocolDefinition {
  return ProtocolDefinition.create({
    id: 'protocol-50-10',
    identityId: 'identity-1',
    name: '50/10 x2',
    phases: [
      { id: 'focus', kind: 'Focus', role: 'cycle', durationMs: 50 * minute },
      { id: 'break', kind: 'ShortBreak', role: 'cycle', durationMs: 10 * minute },
    ],
    cyclePolicy: { mode: 'fixed', cycles: 2 },
    breakPolicy: { afterFinalCycle: 'include' },
    now: asInstant(t0),
  });
}

function createRunningSession(): ProtocolSession {
  const session = ProtocolSession.create({
    id: 'session-1',
    identityId: 'identity-1',
    protocol: create5010(),
    now: asInstant(t0),
  });
  session.start(asInstant(t0));
  return session;
}

describe('ProtocolSession persistence/recovery runtime (ROUTINE-4201)', () => {
  it('credits a completed break from the pre-transition snapshot after durable persistence', async () => {
    const store = createInMemoryProtocolSessionStore();
    const creditBreak = vi.fn();
    const creditRuntime: ProtocolBreakCreditRuntime = {
      creditBreak,
      listHistory: () => [],
    };
    const runtime = createProtocolSessionRuntime({
      store,
      protocolBreakCreditRuntime: creditRuntime,
    });
    const session = createRunningSession();
    session.advanceDuePhases(asInstant(t0 + 50 * minute));
    await runtime.persistNewSession(session);

    const receipt = await runtime.transition({
      identityId: 'identity-1',
      sessionId: 'session-1',
      action: 'phase-complete',
      at: asInstant(t0 + 60 * minute),
    });

    expect(receipt.state).toBe('Running');
    expect(creditBreak).toHaveBeenCalledTimes(1);
    expect(creditBreak.mock.calls[0][0]).toMatchObject({
      factId: 'session-1:1:break:ShortBreak',
      phaseKind: 'ShortBreak',
      breakDurationMs: 10 * minute,
    });
    expect(
      (await store.findById({ identityId: 'identity-1', sessionId: 'session-1' }))?.currentPhase
        ?.kind,
    ).toBe('Focus');
  });

  it('recovers crash-during-focus and crash-during-break from persisted deadlines', async () => {
    const store = createInMemoryProtocolSessionStore();
    const beforeCrash = createProtocolSessionRuntime({ store });
    await beforeCrash.persistNewSession(createRunningSession());

    // Process dies 25m into Focus. A new runtime sees the persisted 50m
    // deadline and leaves the phase unchanged rather than trusting a UI tick.
    const afterCrash = createProtocolSessionRuntime({ store });
    const focusReceipt = await afterCrash.recoverSession({
      identityId: 'identity-1',
      sessionId: 'session-1',
      at: asInstant(t0 + 25 * minute),
    });
    expect(focusReceipt.status).toBe('unchanged');
    expect(focusReceipt.phaseKey).toBe('1:focus:Focus');

    const breakReceipt = await afterCrash.recoverSession({
      identityId: 'identity-1',
      sessionId: 'session-1',
      at: asInstant(t0 + 50 * minute),
    });
    expect(breakReceipt).toMatchObject({
      status: 'applied',
      advancedPhaseCount: 1,
      previousPhaseKey: '1:focus:Focus',
      phaseKey: '1:break:ShortBreak',
    });

    // Crash again during the break; 55m is still break, 60m enters cycle 2.
    const duringBreak = createProtocolSessionRuntime({ store });
    expect(
      await duringBreak.recoverSession({
        identityId: 'identity-1',
        sessionId: 'session-1',
        at: asInstant(t0 + 55 * minute),
      }),
    ).toMatchObject({ status: 'unchanged', phaseKey: '1:break:ShortBreak' });

    expect(
      await duringBreak.recoverSession({
        identityId: 'identity-1',
        sessionId: 'session-1',
        at: asInstant(t0 + 60 * minute),
      }),
    ).toMatchObject({
      status: 'applied',
      advancedPhaseCount: 1,
      phaseKey: '2:focus:Focus',
    });
  });

  it('credits every break crossed by deadline catch-up', async () => {
    const store = createInMemoryProtocolSessionStore();
    const creditBreak = vi.fn();
    const runtime = createProtocolSessionRuntime({
      store,
      protocolBreakCreditRuntime: { creditBreak, listHistory: () => [] },
    });
    await runtime.persistNewSession(createRunningSession());

    const receipt = await runtime.recoverSession({
      identityId: 'identity-1',
      sessionId: 'session-1',
      at: asInstant(t0 + 120 * minute),
    });

    expect(receipt.advancedPhaseCount).toBe(4);
    expect(creditBreak).toHaveBeenCalledTimes(2);
    expect(creditBreak.mock.calls.map(([fact]) => fact.phaseKind)).toEqual([
      'ShortBreak',
      'ShortBreak',
    ]);
  });

  it('credits deadline-owned breaks crossed by a late pause after persistence', async () => {
    const store = createInMemoryProtocolSessionStore();
    const creditBreak = vi.fn();
    const runtime = createProtocolSessionRuntime({
      store,
      protocolBreakCreditRuntime: { creditBreak, listHistory: () => [] },
    });
    await runtime.persistNewSession(createRunningSession());

    const receipt = await runtime.transition({
      identityId: 'identity-1',
      sessionId: 'session-1',
      action: 'pause',
      at: asInstant(t0 + 65 * minute),
    });

    expect(receipt).toMatchObject({
      action: 'pause',
      state: 'Paused',
      advancedPhaseCount: 2,
    });
    expect(creditBreak).toHaveBeenCalledTimes(1);
    expect(creditBreak.mock.calls[0]?.[0]).toMatchObject({
      factId: 'session-1:1:break:ShortBreak',
      phaseKind: 'ShortBreak',
      breakDurationMs: 10 * minute,
      completedAt: t0 + 60 * minute,
    });
    expect(
      (await store.findById({ identityId: 'identity-1', sessionId: 'session-1' }))?.snapshot(),
    ).toMatchObject({
      state: 'Paused',
      currentPlanIndex: 2,
      pausedRemainingMs: 45 * minute,
    });
  });

  it('catches up multiple missed deadlines and persists completion once', async () => {
    const store = createInMemoryProtocolSessionStore();
    const runtime = createProtocolSessionRuntime({ store });
    await runtime.persistNewSession(createRunningSession());

    const receipt = await runtime.recoverSession({
      identityId: 'identity-1',
      sessionId: 'session-1',
      at: asInstant(t0 + 125 * minute),
    });

    expect(receipt).toMatchObject({
      status: 'applied',
      state: 'Completed',
      advancedPhaseCount: 4,
    });
    expect(store.getSaveCount('session-1')).toBe(1);

    // Terminal sessions are excluded from future recovery sweeps.
    expect(await store.listRecoverable({ identityId: 'identity-1' })).toEqual([]);
  });

  it('preserves paused remaining time across restart and excludes pause duration from the resumed deadline', async () => {
    const store = createInMemoryProtocolSessionStore();
    const runtime = createProtocolSessionRuntime({ store });
    await runtime.persistNewSession(createRunningSession());

    await runtime.transition({
      identityId: 'identity-1',
      sessionId: 'session-1',
      action: 'pause',
      at: asInstant(t0 + 20 * minute),
    });

    const restarted = createProtocolSessionRuntime({ store });
    const paused = await restarted.recoverSession({
      identityId: 'identity-1',
      sessionId: 'session-1',
      at: asInstant(t0 + 80 * minute),
    });
    expect(paused).toMatchObject({ status: 'unchanged', state: 'Paused' });

    await restarted.transition({
      identityId: 'identity-1',
      sessionId: 'session-1',
      action: 'resume',
      at: asInstant(t0 + 80 * minute),
    });
    const restored = await store.findById({ identityId: 'identity-1', sessionId: 'session-1' });
    expect(restored?.snapshot()).toMatchObject({
      state: 'Running',
      accumulatedPauseMs: 60 * minute,
      phaseDeadline: asInstant(t0 + 110 * minute),
    });
  });

  it('uses optimistic version fencing so concurrent recovery cannot duplicate a phase transition', async () => {
    const store = createInMemoryProtocolSessionStore();
    await createProtocolSessionRuntime({ store }).persistNewSession(createRunningSession());
    const runtimeA = createProtocolSessionRuntime({ store });
    const runtimeB = createProtocolSessionRuntime({ store });

    const receipts = await Promise.all([
      runtimeA.recoverSession({
        identityId: 'identity-1',
        sessionId: 'session-1',
        at: asInstant(t0 + 50 * minute),
      }),
      runtimeB.recoverSession({
        identityId: 'identity-1',
        sessionId: 'session-1',
        at: asInstant(t0 + 50 * minute),
      }),
    ]);

    expect(receipts.map((item) => item.status).sort()).toEqual(['applied', 'unchanged']);
    expect(store.getSaveCount('session-1')).toBe(1);
    expect(
      (await store.findById({ identityId: 'identity-1', sessionId: 'session-1' }))?.currentPhase,
    ).toMatchObject({ kind: 'ShortBreak', cycle: 1 });
  });

  it('persists cancelled/completed terminal commands and produces a versioned transition receipt', async () => {
    const store = createInMemoryProtocolSessionStore();
    const runtime = createProtocolSessionRuntime({ store });
    await runtime.persistNewSession(createRunningSession());

    const cancelled = await runtime.transition({
      identityId: 'identity-1',
      sessionId: 'session-1',
      action: 'cancel',
      cancelReason: 'user-cancelled',
      at: asInstant(t0 + 5 * minute),
    });

    expect(cancelled).toMatchObject({
      action: 'cancel',
      status: 'applied',
      previousVersion: 2,
      persistedVersion: 3,
      state: 'Cancelled',
    });
    expect(cancelled.operationId).toBe('session-1:v2->v3:cancel');
    expect(await store.listRecoverable({ identityId: 'identity-1' })).toEqual([]);
  });
});
