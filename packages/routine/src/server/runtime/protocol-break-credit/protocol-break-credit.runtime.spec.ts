import { describe, expect, it, vi } from 'vitest';
import { asInstant } from '@memoflow/time';
import {
  ProtocolDefinition,
  ProtocolSession,
  createActiveUsageTrigger,
} from '../../domain/routine';
import { createActiveUsageRuntime } from '../active-usage';
import { FakeActivitySensor } from '../routine-activity';
import {
  buildProtocolBreakCompletionFact,
  createProtocolBreakCreditRuntime,
  type ProtocolBreakCompletionFact,
} from './protocol-break-credit.runtime';

const minute = 60_000;
const t0 = asInstant(Date.parse('2026-08-27T14:00:00.000Z'));

function protocol5010(): ProtocolDefinition {
  return ProtocolDefinition.create({
    id: 'study-50-10',
    identityId: 'identity-1',
    name: '50/10 Study',
    phases: [
      { id: 'focus', kind: 'Focus', role: 'cycle', durationMs: 50 * minute },
      { id: 'break', kind: 'ShortBreak', role: 'cycle', durationMs: 10 * minute },
    ],
    cyclePolicy: { mode: 'fixed', cycles: 2 },
    breakPolicy: { afterFinalCycle: 'include' },
    now: t0,
  });
}

function ambientHarness() {
  const sensor = new FakeActivitySensor(Number(t0));
  const due = vi.fn();
  const activeUsage = createActiveUsageRuntime({
    activitySensor: sensor,
    onOccurrenceDue: due,
    now: () => Number(t0),
    tickIntervalMs: 60 * minute,
  });
  for (const routineId of ['stand', 'eye', 'movement']) {
    activeUsage.registerRoutine({
      identityId: 'identity-1',
      routineId,
      trigger: createActiveUsageTrigger({
        requiredActiveMs: 40 * minute,
        naturalBreakCredit: null,
      }),
      gates: {
        routineEnabled: true,
        profileEnabled: true,
        profileActive: true,
        membershipEnabled: true,
      },
    });
  }
  activeUsage.start();
  return { sensor, due, activeUsage };
}

function creditRuntime(activeUsage: ReturnType<typeof createActiveUsageRuntime>) {
  return createProtocolBreakCreditRuntime({
    activeUsage,
    registrations: [
      { identityId: 'identity-1', routineId: 'stand', kind: 'Stand', minimumBreakMs: 5 * minute },
      { identityId: 'identity-1', routineId: 'eye', kind: 'Eye', minimumBreakMs: 20_000 },
      {
        identityId: 'identity-1',
        routineId: 'movement',
        kind: 'Movement',
        minimumBreakMs: 5 * minute,
      },
    ],
  });
}

describe('ProtocolBreakCreditRuntime (ROUTINE-4203)', () => {
  it('Fixture H: a completed 50/10 break satisfies Stand/Eye/Movement and prevents immediate duplicate intervention', () => {
    const ambient = ambientHarness();
    ambient.activeUsage.advance(asInstant(Number(t0) + 50 * minute));
    expect(ambient.due).toHaveBeenCalledTimes(3);

    const session = ProtocolSession.create({
      id: 'session-50-10',
      identityId: 'identity-1',
      protocol: protocol5010(),
      now: t0,
    });
    session.start(t0);
    session.advanceDuePhases(asInstant(Number(t0) + 50 * minute));
    expect(session.currentPhase?.kind).toBe('ShortBreak');
    const fact = buildProtocolBreakCompletionFact({
      session: session.snapshot(),
      completedAt: asInstant(Number(t0) + 60 * minute),
    });
    expect(fact).toMatchObject({
      factId: 'session-50-10:1:break:ShortBreak',
      phaseKind: 'ShortBreak',
      cycle: 1,
      breakDurationMs: 10 * minute,
    });

    session.advanceDuePhases(asInstant(Number(t0) + 60 * minute));
    expect(session.currentPhase?.kind).toBe('Focus');
    const credits = creditRuntime(ambient.activeUsage).creditBreak(fact!);
    expect(credits.credited.map((entry) => entry.routineKind).sort()).toEqual([
      'Eye',
      'Movement',
      'Stand',
    ]);
    for (const routineId of ['stand', 'eye', 'movement']) {
      expect(ambient.activeUsage.getSnapshot('identity-1', routineId)).toMatchObject({
        accumulatedActiveMs: 0,
        generation: 2,
        thresholdSignaled: false,
        lastSatisfiedAt: Number(t0) + 60 * minute,
      });
    }

    ambient.activeUsage.advance(asInstant(Number(t0) + 60 * minute + 1_000));
    expect(ambient.due).toHaveBeenCalledTimes(3);
    ambient.activeUsage.stop();
  });

  it('makes Stand/Eye/Movement compatibility explicit instead of inferring it from routine names', () => {
    const ambient = ambientHarness();
    ambient.activeUsage.advance(asInstant(Number(t0) + 10 * minute));
    const runtime = creditRuntime(ambient.activeUsage);
    const fact: ProtocolBreakCompletionFact = {
      factId: 'session-1:1:break:ShortBreak',
      identityId: 'identity-1',
      sessionId: 'session-1',
      protocolId: 'protocol-1',
      phaseKey: '1:break:ShortBreak',
      phaseId: 'break',
      phaseKind: 'ShortBreak',
      cycle: 1,
      breakStartedAt: t0,
      completedAt: asInstant(Number(t0) + 6 * minute),
      breakDurationMs: 6 * minute,
      capabilities: ['screen-rest'],
    };

    const report = runtime.creditBreak(fact);
    expect(report.credited.map((entry) => entry.routineKind)).toEqual(['Eye']);
    expect(report.skipped).toEqual(
      expect.arrayContaining([
        { routineId: 'stand', reason: 'incompatible' },
        { routineId: 'movement', reason: 'incompatible' },
      ]),
    );
    ambient.activeUsage.stop();
  });

  it('honors each routine-owned minimum break and ignores non-break protocol phases', () => {
    const ambient = ambientHarness();
    const runtime = creditRuntime(ambient.activeUsage);
    const session = ProtocolSession.create({
      id: 'session-1',
      identityId: 'identity-1',
      protocol: protocol5010(),
      now: t0,
    });
    session.start(t0);
    expect(
      buildProtocolBreakCompletionFact({
        session: session.snapshot(),
        completedAt: Number(t0) + minute,
      }),
    ).toBeNull();

    session.advanceDuePhases(asInstant(Number(t0) + 50 * minute));
    const shortFact = buildProtocolBreakCompletionFact({
      session: session.snapshot(),
      completedAt: Number(t0) + 50 * minute + 10_000,
    })!;
    const report = runtime.creditBreak(shortFact);
    expect(report.credited).toEqual([]);
    expect(report.skipped.map((entry) => entry.reason)).toEqual([
      'break-too-short',
      'break-too-short',
      'break-too-short',
    ]);
    ambient.activeUsage.stop();
  });

  it('does not count a protocol break interval as active usage before the satisfaction reset', () => {
    const ambient = ambientHarness();
    ambient.activeUsage.advance(asInstant(Number(t0) + 35 * minute));
    expect(ambient.due).not.toHaveBeenCalled();

    const runtime = creditRuntime(ambient.activeUsage);
    const fact: ProtocolBreakCompletionFact = {
      factId: 'session-35m:1:break:ShortBreak',
      identityId: 'identity-1',
      sessionId: 'session-35m',
      protocolId: 'study-50-10',
      phaseKey: '1:break:ShortBreak',
      phaseId: 'break',
      phaseKind: 'ShortBreak',
      cycle: 1,
      breakStartedAt: asInstant(Number(t0) + 35 * minute),
      completedAt: asInstant(Number(t0) + 45 * minute),
      breakDurationMs: 10 * minute,
      capabilities: ['stand', 'screen-rest', 'movement'],
    };

    const report = runtime.creditBreak(fact);
    expect(report.credited).toHaveLength(3);
    expect(ambient.due).not.toHaveBeenCalled();
    expect(ambient.activeUsage.getSnapshot('identity-1', 'stand')).toMatchObject({
      accumulatedActiveMs: 0,
      generation: 2,
    });

    ambient.activeUsage.advance(asInstant(Number(t0) + 45 * minute + 1_000));
    expect(ambient.activeUsage.getSnapshot('identity-1', 'stand')?.accumulatedActiveMs).toBe(1_000);
    expect(ambient.due).not.toHaveBeenCalled();
    ambient.activeUsage.stop();
  });

  it('publishes the exact satisfied ActiveUsage occurrence for presentation cleanup', () => {
    const ambient = ambientHarness();
    ambient.activeUsage.advance(asInstant(Number(t0) + 40 * minute));
    const onRoutineSatisfied = vi.fn();
    const runtime = createProtocolBreakCreditRuntime({
      activeUsage: ambient.activeUsage,
      registrations: [
        { identityId: 'identity-1', routineId: 'stand', kind: 'Stand', minimumBreakMs: minute },
      ],
      onRoutineSatisfied,
    });
    const fact: ProtocolBreakCompletionFact = {
      factId: 'session-callback:1:break:ShortBreak',
      identityId: 'identity-1',
      sessionId: 'session-callback',
      protocolId: 'study-50-10',
      phaseKey: '1:break:ShortBreak',
      phaseId: 'break',
      phaseKind: 'ShortBreak',
      cycle: 1,
      breakStartedAt: asInstant(Number(t0) + 40 * minute),
      completedAt: asInstant(Number(t0) + 50 * minute),
      breakDurationMs: 10 * minute,
      capabilities: ['stand'],
    };

    runtime.creditBreak(fact);
    expect(onRoutineSatisfied).toHaveBeenCalledOnce();
    expect(onRoutineSatisfied).toHaveBeenCalledWith(
      expect.objectContaining({
        routineId: 'stand',
        satisfiedAt: fact.completedAt,
        activeUsage: expect.objectContaining({
          occurrenceKey: 'routine:stand:active-usage:1',
          nextGeneration: 2,
        }),
      }),
    );
    ambient.activeUsage.stop();
  });

  it('records protocol-to-ambient correlation history and deduplicates replayed break facts', () => {
    const ambient = ambientHarness();
    ambient.activeUsage.advance(asInstant(Number(t0) + 40 * minute));
    const runtime = creditRuntime(ambient.activeUsage);
    const fact: ProtocolBreakCompletionFact = {
      factId: 'session-1:1:break:ShortBreak',
      identityId: 'identity-1',
      sessionId: 'session-1',
      protocolId: 'study-50-10',
      phaseKey: '1:break:ShortBreak',
      phaseId: 'break',
      phaseKind: 'ShortBreak',
      cycle: 1,
      breakStartedAt: asInstant(Number(t0) + 50 * minute),
      completedAt: asInstant(Number(t0) + 60 * minute),
      breakDurationMs: 10 * minute,
      capabilities: ['stand', 'screen-rest', 'movement'],
    };

    const first = runtime.creditBreak(fact);
    expect(first.credited).toHaveLength(3);
    expect(runtime.listHistory()[0]).toMatchObject({
      breakFactId: fact.factId,
      sessionId: 'session-1',
      phaseKey: '1:break:ShortBreak',
      routineId: 'stand',
      activeUsage: {
        occurrenceKey: 'routine:stand:active-usage:1',
        completedGeneration: 1,
        nextGeneration: 2,
      },
    });

    const replay = runtime.creditBreak(fact);
    expect(replay).toEqual({ factId: fact.factId, duplicate: true, credited: [], skipped: [] });
    expect(runtime.listHistory()).toHaveLength(3);
    expect(ambient.activeUsage.getSnapshot('identity-1', 'stand')?.generation).toBe(2);
    ambient.activeUsage.stop();
  });
});
