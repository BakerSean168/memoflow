import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { DesktopRoutineAICommandAdapter } from './routine-command.adapter';

const context: ExecutionContext = {
  identityId: 'identity-1',
  requestId: 'request-1',
  traceId: 'request-1',
  startedAt: Date.parse('2026-09-15T23:45:00.000Z'),
  source: 'ipc',
};

const wallClockTrigger = {
  type: 'WallClock' as const,
  timingOwner: 'scheduler' as const,
  localTime: '22:30',
  timeZone: 'Asia/Tokyo',
  recurrence: {
    startDate: '2026-09-16',
    frequency: 'daily' as const,
    interval: 1,
    byWeekday: [],
    count: null,
    until: null,
  },
};

describe('DesktopRoutineAICommandAdapter', () => {
  it('passes the canonical WallClock trigger to the Routine owner', async () => {
    const createRoutine = vi.fn(async () => ({
      routineId: 'r-1',
      identityId: 'identity-1',
      name: 'Wind down',
      version: 1,
    }));
    const adapter = new DesktopRoutineAICommandAdapter({ createRoutine } as never);

    await expect(
      adapter.createRoutine({
        context,
        name: 'Wind down',
        trigger: wallClockTrigger,
        profileIds: ['work'],
      }),
    ).resolves.toEqual({
      kind: 'routine',
      id: 'r-1',
      status: 'created',
      details: { name: 'Wind down' },
    });

    expect(createRoutine).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'identity-1',
        name: 'Wind down',
        profileIds: ['work'],
        at: context.startedAt,
        trigger: expect.objectContaining({
          type: 'WallClock',
          localTime: '22:30',
          timeZone: 'Asia/Tokyo',
          recurrence: expect.objectContaining({ frequency: 'daily' }),
        }),
      }),
    );
  });

  it('passes ActiveUsage semantics without selecting a method preset', async () => {
    const createRoutine = vi.fn(async () => ({
      routineId: 'r-2',
      identityId: 'identity-1',
      name: 'Active focus',
      version: 1,
    }));
    const adapter = new DesktopRoutineAICommandAdapter({ createRoutine } as never);

    await adapter.createRoutine({
      context,
      name: 'Active focus',
      trigger: {
        type: 'ActiveUsage',
        timingOwner: 'local-runtime',
        requiredActiveMs: 45 * 60_000,
        anchor: 'last-satisfied',
        naturalBreakCredit: {
          idleDurationMs: 5 * 60_000,
          effect: 'satisfy-and-reset',
        },
        protocolBreakCredit: null,
      },
    });

    expect(createRoutine).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({
          type: 'ActiveUsage',
          requiredActiveMs: 45 * 60_000,
          naturalBreakCredit: { idleDurationMs: 5 * 60_000, effect: 'satisfy-and-reset' },
        }),
      }),
    );
  });

  it('delegates profile, override, and protocol commands to the Routine owner port', async () => {
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
    const adapter = new DesktopRoutineAICommandAdapter(routine as never);

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
