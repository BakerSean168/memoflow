import { describe, expect, it } from 'vitest';
import { asInstant } from '@memoflow/time';
import {
  PROTOCOL_PHASE_KINDS,
  PROTOCOL_SESSION_TRANSITIONS,
  ProtocolDefinition,
  ProtocolSession,
  type ProtocolSessionAction,
  type ProtocolSessionState,
} from '..';

const minute = 60_000;
const t0 = asInstant(Date.parse('2026-08-25T14:00:00.000Z'));

function create5010(options: { afterFinalCycle?: 'include' | 'skip' } = {}) {
  return ProtocolDefinition.create({
    id: 'study-50-10',
    identityId: 'identity-1',
    name: '50/10 Study',
    phases: [
      { id: 'focus', kind: 'Focus', role: 'cycle', durationMs: 50 * minute },
      { id: 'break', kind: 'ShortBreak', role: 'cycle', durationMs: 10 * minute },
    ],
    cyclePolicy: { mode: 'fixed', cycles: 2 },
    breakPolicy: { afterFinalCycle: options.afterFinalCycle ?? 'include' },
    now: t0,
  });
}

describe('ProtocolDefinition', () => {
  it('owns the phase vocabulary and keeps protocol truth independent from Electron', () => {
    expect(PROTOCOL_PHASE_KINDS).toEqual([
      'Prepare',
      'Focus',
      'ShortBreak',
      'LongBreak',
      'Recovery',
    ]);
    const source = ProtocolDefinition.toString();
    expect(source).not.toContain('BrowserWindow');
    expect(source).not.toContain('Electron');
  });

  it('expands 50/10 x2 into Focus -> Break -> Focus -> Break', () => {
    expect(
      create5010()
        .buildPhasePlan()
        .map((phase) => [phase.kind, phase.cycle, phase.durationMs]),
    ).toEqual([
      ['Focus', 1, 50 * minute],
      ['ShortBreak', 1, 10 * minute],
      ['Focus', 2, 50 * minute],
      ['ShortBreak', 2, 10 * minute],
    ]);
  });

  it('applies deterministic final-break and long-break policies', () => {
    const protocol = ProtocolDefinition.create({
      identityId: 'identity-1',
      name: 'Pomodoro',
      phases: [
        { id: 'prepare', kind: 'Prepare', role: 'session-start', durationMs: minute },
        { id: 'focus', kind: 'Focus', role: 'cycle', durationMs: 25 * minute },
        { id: 'break', kind: 'ShortBreak', role: 'cycle', durationMs: 5 * minute },
        { id: 'recover', kind: 'Recovery', role: 'session-end', durationMs: 2 * minute },
      ],
      cyclePolicy: { mode: 'fixed', cycles: 4 },
      breakPolicy: {
        afterFinalCycle: 'skip',
        longBreakEveryCycles: 2,
        longBreakDurationMs: 15 * minute,
      },
      now: t0,
    });
    const plan = protocol.buildPhasePlan();

    expect(plan[0]).toMatchObject({ kind: 'Prepare', cycle: null });
    expect(plan.filter((phase) => phase.kind === 'LongBreak').map((phase) => phase.cycle)).toEqual([
      2,
    ]);
    expect(plan.at(-1)).toMatchObject({ kind: 'Recovery', cycle: null });
    expect(plan.some((phase) => phase.cycle === 4 && phase.kind.includes('Break'))).toBe(false);
  });
});

describe('ProtocolSession deterministic state machine', () => {
  it('declares the transition table explicitly', () => {
    const cases: Array<
      [ProtocolSessionState, ProtocolSessionAction, readonly ProtocolSessionState[] | undefined]
    > = [
      ['Idle', 'start', ['Running']],
      ['Running', 'pause', ['Paused']],
      ['Paused', 'resume', ['Running']],
      ['Running', 'phase-complete', ['Running', 'Completed']],
      ['Running', 'end', ['Completed']],
      ['Paused', 'cancel', ['Cancelled']],
      ['Completed', 'start', undefined],
      ['Cancelled', 'resume', undefined],
    ];
    for (const [state, action, target] of cases) {
      expect(
        (
          PROTOCOL_SESSION_TRANSITIONS[state] as Partial<
            Record<ProtocolSessionAction, readonly ProtocolSessionState[]>
          >
        )[action],
      ).toEqual(target);
    }
  });

  it('runs exactly 50 focus -> 10 break -> 50 focus -> 10 break -> completed', () => {
    const session = ProtocolSession.create({
      id: 'session-1',
      identityId: 'identity-1',
      protocol: create5010(),
      now: t0,
    });

    session.start(t0);
    expect([session.status, session.currentPhase?.kind, session.currentCycle]).toEqual([
      'Running',
      'Focus',
      1,
    ]);

    session.advanceDuePhases(asInstant(Number(t0) + 50 * minute));
    expect([session.currentPhase?.kind, session.currentCycle]).toEqual(['ShortBreak', 1]);

    session.advanceDuePhases(asInstant(Number(t0) + 60 * minute));
    expect([session.currentPhase?.kind, session.currentCycle]).toEqual(['Focus', 2]);

    session.advanceDuePhases(asInstant(Number(t0) + 110 * minute));
    expect([session.currentPhase?.kind, session.currentCycle]).toEqual(['ShortBreak', 2]);

    session.advanceDuePhases(asInstant(Number(t0) + 120 * minute));
    expect(session.status).toBe('Completed');
    expect(session.terminationReason).toBe('completed');
  });

  it('pause/resume preserves remaining phase time and accumulated pause', () => {
    const session = ProtocolSession.create({
      identityId: 'identity-1',
      protocol: create5010(),
      now: t0,
    });
    session.start(t0);
    session.pause(asInstant(Number(t0) + 20 * minute));

    expect(session.status).toBe('Paused');
    expect(session.remainingMs(asInstant(Number(t0) + 30 * minute))).toBe(30 * minute);

    session.resume(asInstant(Number(t0) + 30 * minute));
    expect(session.status).toBe('Running');
    expect(session.remainingMs(asInstant(Number(t0) + 30 * minute))).toBe(30 * minute);
    expect(session.snapshot().accumulatedPauseMs).toBe(10 * minute);
    expect(Number(session.snapshot().phaseDeadline)).toBe(Number(t0) + 60 * minute);
  });

  it('can restore a persistent session snapshot and catch up from deadlines after restart', () => {
    const session = ProtocolSession.create({
      identityId: 'identity-1',
      protocol: create5010(),
      now: t0,
    });
    session.start(t0);
    const snapshot = session.snapshot();
    const restored = ProtocolSession.load(snapshot);

    expect(restored.protocolVersion).toBe(1);
    expect(restored.currentPhase?.kind).toBe('Focus');
    expect(restored.advanceDuePhases(asInstant(Number(t0) + 65 * minute))).toBe(2);
    expect([restored.currentPhase?.kind, restored.currentCycle]).toEqual(['Focus', 2]);
  });

  it('rejects cross-field inconsistent persistent snapshots during restore', () => {
    const session = ProtocolSession.create({
      identityId: 'identity-1',
      protocol: create5010(),
      now: t0,
    });
    session.start(t0);
    const running = session.snapshot();

    expect(() =>
      ProtocolSession.load({
        ...running,
        protocolVersion: running.protocolVersion + 1,
      }),
    ).toThrow('protocol snapshot version mismatch');
    expect(() =>
      ProtocolSession.load({
        ...running,
        state: 'Paused',
        pausedAt: null,
      }),
    ).toThrow('Paused ProtocolSession snapshot is inconsistent');
    expect(() =>
      ProtocolSession.load({
        ...running,
        state: 'Completed',
        endedAt: asInstant(Number(t0) + minute),
        terminationReason: 'user-cancelled',
        phaseDeadline: null,
      }),
    ).toThrow('invalid termination reason');
  });

  it('captures the expanded plan so an active session is insulated from later definition revisions', () => {
    const protocol = create5010();
    const session = ProtocolSession.create({ identityId: 'identity-1', protocol, now: t0 });
    const original = session.snapshot();

    protocol.revise(
      {
        phases: [
          { id: 'focus', kind: 'Focus', role: 'cycle', durationMs: 40 * minute },
          { id: 'break', kind: 'ShortBreak', role: 'cycle', durationMs: 10 * minute },
        ],
      },
      asInstant(Number(t0) + minute),
    );

    expect(protocol.version).toBe(2);
    expect(original.protocolVersion).toBe(1);
    expect(original.phasePlan.map((phase) => phase.durationMs)).toEqual([
      50 * minute,
      10 * minute,
      50 * minute,
      10 * minute,
    ]);
    expect(session.snapshot()).toEqual(original);
  });

  it('keeps an open-ended Flowtime focus phase manual instead of inventing a wall-clock deadline', () => {
    const flowtime = ProtocolDefinition.create({
      identityId: 'identity-1',
      name: 'Flowtime',
      phases: [
        { id: 'focus', kind: 'Focus', role: 'cycle', durationMs: null },
        { id: 'recover', kind: 'Recovery', role: 'session-end', durationMs: 5 * minute },
      ],
      cyclePolicy: { mode: 'fixed', cycles: 1 },
      now: t0,
    });
    const session = ProtocolSession.create({
      identityId: 'identity-1',
      protocol: flowtime,
      now: t0,
    });
    session.start(t0);

    expect(session.snapshot().phaseDeadline).toBeNull();
    expect(session.advanceDuePhases(asInstant(Number(t0) + 3 * 60 * minute))).toBe(0);
    session.completeCurrentPhase(asInstant(Number(t0) + 47 * minute));
    expect(session.currentPhase?.kind).toBe('Recovery');
  });

  it('catches up an expired phase before pausing and counts pause time when ending while paused', () => {
    const session = ProtocolSession.create({
      identityId: 'identity-1',
      protocol: create5010(),
      now: t0,
    });
    session.start(t0);
    session.pause(asInstant(Number(t0) + 55 * minute));

    expect(session.currentPhase?.kind).toBe('ShortBreak');
    expect(session.remainingMs(asInstant(Number(t0) + 55 * minute))).toBe(5 * minute);
    session.end(asInstant(Number(t0) + 60 * minute));
    expect(session.snapshot().accumulatedPauseMs).toBe(5 * minute);
  });

  it.each([
    ['end', 'Completed', 'user-ended'],
    ['cancel', 'Cancelled', 'user-cancelled'],
  ] as const)('%s records an explicit termination reason', (action, status, reason) => {
    const session = ProtocolSession.create({
      identityId: 'identity-1',
      protocol: create5010(),
      now: t0,
    });
    session.start(t0);
    const at = asInstant(Number(t0) + minute);
    if (action === 'end') session.end(at);
    else session.cancel(at);

    expect(session.status).toBe(status);
    expect(session.terminationReason).toBe(reason);
    expect(session.snapshot().endedAt).toBe(at);
  });

  it('rejects invalid transitions rather than silently mutating terminal state', () => {
    const session = ProtocolSession.create({
      identityId: 'identity-1',
      protocol: create5010(),
      now: t0,
    });
    expect(() => session.pause(t0)).toThrow('Idle -> pause');
    session.start(t0);
    session.cancel(asInstant(Number(t0) + minute));
    expect(() => session.resume(asInstant(Number(t0) + 2 * minute))).toThrow('Cancelled -> resume');
  });
});
