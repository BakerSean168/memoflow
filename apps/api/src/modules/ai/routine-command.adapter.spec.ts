import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { RoutineAICommandAdapter } from './routine-command.adapter';

const context: ExecutionContext = {
  identityId: 'identity-1',
  requestId: 'request-1',
  traceId: 'request-1',
  startedAt: 1_000,
  source: 'http',
};

describe('RoutineAICommandAdapter', () => {
  it('maps a WallClock method preset into the existing Reminder application mutation', async () => {
    const createTemplate = vi.fn(async () => ok({ id: 'ReminderTemplateId_1', name: '20-20-20' } as never));
    const adapter = new RoutineAICommandAdapter({ createTemplate } as never, {} as never);

    await expect(adapter.createRoutine({
      context,
      title: 'Eye break',
      methodId: '20-20-20',
      profileIds: ['work'],
    })).resolves.toMatchObject({ kind: 'routine', status: 'created' });

    expect(createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Eye break',
        type: 'Recurring',
        trigger: expect.objectContaining({
          type: 'Interval',
          interval: { minutes: 20, startTime: null },
        }),
        profileIds: ['work'],
      }),
      context,
    );
  });

  it('rejects Protocol presets on the ReminderTemplate creation path', async () => {
    const adapter = new RoutineAICommandAdapter({} as never, {} as never);
    await expect(adapter.createRoutine({ context, title: 'Focus', methodId: 'pomodoro' }))
      .rejects.toThrow(/routine_start_protocol/);
  });

  it('delegates profile, override, and protocol state to the Routine owner port', async () => {
    const routine = {
      setProfileActive: vi.fn(async () => ({ profileId: 'work', active: true })),
      setTemporaryOverride: vi.fn(async () => ({ routineId: 'r-1', override: { expiresAt: 2_000 } })),
      clearTemporaryOverride: vi.fn(async () => ({ routineId: 'r-1', override: null })),
      startPresetProtocol: vi.fn(async () => ({ sessionId: 's-1', protocolId: 'p-1', state: 'Running', phaseKey: 'focus' })),
      transitionProtocol: vi.fn(async () => ({ sessionId: 's-1', state: 'Paused', phaseKey: 'focus' })),
    };
    const adapter = new RoutineAICommandAdapter({} as never, routine as never);

    await adapter.setProfileActive({ context, profileId: 'work', active: true });
    await adapter.setTemporaryOverride({ context, routineId: 'r-1', expiresAt: 2_000, reason: 'focus' });
    await adapter.clearTemporaryOverride({ context, routineId: 'r-1' });
    await adapter.startProtocol({ context, methodId: 'pomodoro' });
    await adapter.transitionProtocol({ context, sessionId: 's-1', action: 'pause' });

    expect(routine.setProfileActive).toHaveBeenCalledWith(expect.objectContaining({ identityId: 'identity-1', profileId: 'work' }));
    expect(routine.setTemporaryOverride).toHaveBeenCalledWith(expect.objectContaining({ identityId: 'identity-1', routineId: 'r-1' }));
    expect(routine.startPresetProtocol).toHaveBeenCalledWith(expect.objectContaining({ identityId: 'identity-1', methodId: 'pomodoro' }));
    expect(routine.transitionProtocol).toHaveBeenCalledWith(expect.objectContaining({ identityId: 'identity-1', sessionId: 's-1', action: 'pause' }));
  });
});
