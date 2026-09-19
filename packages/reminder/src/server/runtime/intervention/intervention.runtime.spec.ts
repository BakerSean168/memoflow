import { describe, expect, it, vi } from 'vitest';
import { asInstant } from '@memoflow/time';
import { createInterventionRuntime, type InterventionPolicy } from './intervention.runtime';

const minute = 60_000;
const t0 = asInstant(Date.parse('2026-08-27T04:00:00.000Z'));

const gentlePolicy: InterventionPolicy = {
  gentleDurationMs: 2 * minute,
  graceDurationMs: 3 * minute,
  guidedDurationMs: 5 * minute,
  strictEnabled: false,
};

const strictPolicy: InterventionPolicy = { ...gentlePolicy, strictEnabled: true };

function due(
  runtime = createInterventionRuntime(),
  policy = gentlePolicy,
  key = 'routine:stand:active-usage:0',
) {
  runtime.createDue({
    identityId: 'identity-1',
    routineId: 'stand',
    occurrenceKey: key,
    dueAt: t0,
    policy,
  });
  return { runtime, key };
}

describe('InterventionRuntime (ROUTINE-4103)', () => {
  it('progresses Due -> Gentle -> Grace -> Guided and never enters Strict without explicit opt-in', () => {
    const { runtime, key } = due();

    expect(runtime.advance(key, t0).snapshot).toMatchObject({
      state: 'Gentle',
      version: 2,
    });
    expect(runtime.advance(key, Number(t0) + 2 * minute).state).toBe('Grace');
    expect(runtime.advance(key, Number(t0) + 5 * minute).state).toBe('Guided');
    expect(runtime.advance(key, Number(t0) + 60 * minute)).toMatchObject({
      state: 'Guided',
      applied: false,
    });
    expect(() =>
      runtime.execute(key, { action: 'safe-escape', at: Number(t0) + 60 * minute }),
    ).toThrow('safe-escape is only valid');
  });

  it('catches up coarse time deterministically into opt-in Strict and always preserves safe escape', () => {
    const { runtime, key } = due(createInterventionRuntime(), strictPolicy);
    const receipt = runtime.advance(key, Number(t0) + 20 * minute);

    expect(receipt.state).toBe('Strict');
    expect(receipt.transitions.map((transition) => `${transition.from}->${transition.to}`)).toEqual(
      ['Due->Gentle', 'Gentle->Grace', 'Grace->Guided', 'Guided->Strict'],
    );
    expect(receipt.transitions.map((transition) => Number(transition.at))).toEqual([
      Number(t0),
      Number(t0) + 2 * minute,
      Number(t0) + 5 * minute,
      Number(t0) + 10 * minute,
    ]);

    const escaped = runtime.execute(key, { action: 'safe-escape', at: Number(t0) + 20 * minute });
    expect(escaped).toMatchObject({ state: 'Escaped', applied: true });
    expect(runtime.listActive()).toEqual([]);
  });

  it('converges Natural Break and explicit complete races onto one terminal truth', () => {
    const { runtime, key } = due();
    runtime.advance(key, t0);

    const natural = runtime.execute(key, { action: 'natural-stop', at: Number(t0) + minute });
    expect(natural.snapshot).toMatchObject({
      state: 'Completed',
      completionReason: 'natural-stop',
    });
    const versionAfterNaturalStop = natural.version;

    const lateClick = runtime.execute(key, { action: 'complete', at: Number(t0) + minute + 100 });
    expect(lateClick).toMatchObject({
      state: 'Completed',
      applied: false,
      version: versionAfterNaturalStop,
      transitions: [],
    });
    expect(
      runtime.getSnapshot(key)?.history.filter((entry) => entry.to === 'Completed'),
    ).toHaveLength(1);
  });

  it('models snooze/dismiss as explicit terminal interactions and rejects invalid snooze atomically', () => {
    const { runtime, key } = due();
    const before = runtime.getSnapshot(key)!;

    expect(() => runtime.execute(key, { action: 'snooze', durationMs: 0, at: t0 })).toThrow(
      'snooze.durationMs must be a positive finite number',
    );
    expect(runtime.getSnapshot(key)).toEqual(before);

    const snoozed = runtime.execute(key, {
      action: 'snooze',
      durationMs: 15 * minute,
      at: t0,
    });
    expect(snoozed.snapshot).toMatchObject({
      state: 'Snoozed',
      snoozeUntil: Number(t0) + 15 * minute,
    });

    const second = due(createInterventionRuntime(), gentlePolicy, 'routine:eye:active-usage:0');
    expect(second.runtime.execute(second.key, { action: 'dismiss', at: t0 }).state).toBe(
      'Dismissed',
    );
  });

  it('re-opens the same occurrence exactly when a snooze expires', () => {
    const { runtime, key } = due();
    const snoozed = runtime.execute(key, {
      action: 'snooze',
      durationMs: minute,
      at: t0,
    });

    expect(runtime.listActive()).toEqual([expect.objectContaining({ occurrenceKey: key, state: 'Snoozed' })]);
    expect(runtime.advance(key, Number(t0) + minute - 1)).toMatchObject({
      applied: false,
      state: 'Snoozed',
      version: snoozed.version,
    });

    const resumed = runtime.advance(key, Number(t0) + minute);
    expect(resumed).toMatchObject({
      occurrenceKey: key,
      state: 'Gentle',
      applied: true,
      version: snoozed.version + 1,
      transitions: [
        expect.objectContaining({
          from: 'Snoozed',
          to: 'Gentle',
          reason: 'snooze-expired',
          at: Number(t0) + minute,
        }),
      ],
      snapshot: { snoozeUntil: null },
    });
  });

  it('permits complete/natural-stop/snooze/dismiss from every presented phase and rejects pre-due commands', () => {
    const phaseTimes = [
      ['Gentle', Number(t0)],
      ['Grace', Number(t0) + 2 * minute],
      ['Guided', Number(t0) + 5 * minute],
      ['Strict', Number(t0) + 10 * minute],
    ] as const;
    const commands = [
      { action: 'complete' as const, terminal: 'Completed' },
      { action: 'natural-stop' as const, terminal: 'Completed' },
      { action: 'snooze' as const, durationMs: minute, terminal: 'Snoozed' },
      { action: 'dismiss' as const, terminal: 'Dismissed' },
    ];

    for (const [phase, at] of phaseTimes) {
      for (const command of commands) {
        const key = `routine:${phase}:${command.action}`;
        const { runtime } = due(createInterventionRuntime(), strictPolicy, key);
        runtime.advance(key, at);
        expect(runtime.getSnapshot(key)?.state).toBe(phase);
        expect(runtime.execute(key, { ...command, at } as never).state).toBe(command.terminal);
      }
    }

    const beforeDue = due(createInterventionRuntime(), strictPolicy, 'routine:pre-due');
    expect(() =>
      beforeDue.runtime.execute(beforeDue.key, {
        action: 'complete',
        at: Number(t0) - 1,
      }),
    ).toThrow('Intervention command cannot precede dueAt');
    expect(beforeDue.runtime.getSnapshot(beforeDue.key)?.state).toBe('Due');
  });

  it('restores a runtime snapshot and emits changes only for applied transitions', () => {
    const first = due(createInterventionRuntime(), strictPolicy);
    first.runtime.advance(first.key, Number(t0) + 4 * minute);
    const saved = first.runtime.getSnapshot(first.key)!;

    const restarted = createInterventionRuntime();
    const changed = vi.fn();
    restarted.onChanged(changed);
    restarted.restore(saved);
    expect(restarted.getSnapshot(first.key)).toEqual(saved);

    changed.mockClear();
    restarted.advance(first.key, Number(t0) + 4 * minute + 30_000);
    expect(changed).not.toHaveBeenCalled();

    restarted.advance(first.key, Number(t0) + 6 * minute);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(restarted.getSnapshot(first.key)?.state).toBe('Guided');
  });
});
