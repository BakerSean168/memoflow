import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { RoutineAICommandAdapter } from './routine-command.adapter';

const userTimeContextPort = {
  getUserTimeContext: vi.fn(async () => ({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 as const })),
};

const context: ExecutionContext = {
  identityId: 'identity-1',
  requestId: 'request-1',
  traceId: 'request-1',
  startedAt: Date.parse('2026-09-15T23:45:00.000Z'),
  source: 'http',
};

describe('RoutineAICommandAdapter', () => {
  it('maps a method preset into canonical Routine creation and preserves the receipt', async () => {
    const createRoutine = vi.fn(async () => ({
      routineId: 'r-1',
      identityId: 'identity-1',
      name: 'Eye break',
      version: 1,
    }));
    const adapter = new RoutineAICommandAdapter({ createRoutine } as never, userTimeContextPort);

    await expect(
      adapter.createRoutine({
        context,
        title: 'Eye break',
        methodId: '20-20-20',
        profileIds: ['work'],
      }),
    ).resolves.toEqual({
      kind: 'routine',
      id: 'r-1',
      status: 'created',
      details: { title: 'Eye break' },
    });

    expect(createRoutine).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'identity-1',
        name: 'Eye break',
        profileIds: ['work'],
        at: context.startedAt,
        trigger: expect.objectContaining({ type: 'Elapsed', durationMs: 20 * 60_000 }),
      }),
    );
  });

  it('maps an explicit fixed-time trigger to the user timezone', async () => {
    const createRoutine = vi.fn(async () => ({
      routineId: 'r-2',
      identityId: 'identity-1',
      name: 'Wind down',
      version: 1,
    }));
    const adapter = new RoutineAICommandAdapter({ createRoutine } as never, userTimeContextPort);

    await adapter.createRoutine({
      context,
      title: 'Wind down',
      trigger: { type: 'FixedTime', fixedTime: '22:30' },
    });

    expect(createRoutine).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({
          type: 'WallClock',
          localTime: '22:30',
          timeZone: 'Asia/Tokyo',
          recurrence: expect.objectContaining({
            startDate: '2026-09-16',
            frequency: 'daily',
          }),
        }),
      }),
    );
  });

  it('rejects Protocol presets on the Routine creation path', async () => {
    const adapter = new RoutineAICommandAdapter({} as never, userTimeContextPort);
    await expect(
      adapter.createRoutine({ context, title: 'Focus', methodId: 'pomodoro' }),
    ).rejects.toThrow(/routine_start_protocol/);
  });

  it('delegates profile, override, and protocol state to the Routine owner port', async () => {
    const routine = {
      setProfileActive: vi.fn(async () => ({ profileId: 'work', active: true })),
      setTemporaryOverride: vi.fn(async () => ({
        routineId: 'r-1',
        override: { expiresAt: 2_000 },
      })),
      clearTemporaryOverride: vi.fn(async () => ({ routineId: 'r-1', override: null })),
      startPresetProtocol: vi.fn(async () => ({
        sessionId: 's-1',
        protocolId: 'p-1',
        state: 'Running',
        phaseKey: 'focus',
      })),
      transitionProtocol: vi.fn(async () => ({
        sessionId: 's-1',
        state: 'Paused',
        phaseKey: 'focus',
      })),
    };
    const adapter = new RoutineAICommandAdapter(routine as never, userTimeContextPort);

    await adapter.setProfileActive({ context, profileId: 'work', active: true });
    await adapter.setTemporaryOverride({
      context,
      routineId: 'r-1',
      expiresAt: 2_000,
      reason: 'focus',
    });
    await adapter.clearTemporaryOverride({ context, routineId: 'r-1' });
    await adapter.startProtocol({ context, methodId: 'pomodoro' });
    await adapter.transitionProtocol({ context, sessionId: 's-1', action: 'pause' });

    expect(routine.setProfileActive).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-1', profileId: 'work' }),
    );
    expect(routine.setTemporaryOverride).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-1', routineId: 'r-1' }),
    );
    expect(routine.startPresetProtocol).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-1', methodId: 'pomodoro' }),
    );
    expect(routine.transitionProtocol).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-1', sessionId: 's-1', action: 'pause' }),
    );
  });
});
