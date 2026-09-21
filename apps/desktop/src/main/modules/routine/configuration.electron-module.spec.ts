import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { RoutineChannels } from '@memoflow/contracts/electron';
import type { RoutineCoachCommandPort, RoutineConfigurationQueryPort } from '@memoflow/reminder';
import { createRoutineConfigurationElectronModule } from './configuration.electron-module';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

beforeEach(() => {
  handlers.clear();
  vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
    handlers.set(channel, handler as (...args: unknown[]) => unknown);
  });
  vi.mocked(ipcMain.removeHandler).mockImplementation((channel) => {
    handlers.delete(channel);
  });
});

describe('Routine Configuration Electron module', () => {
  it('serves the owner-backed snapshot through authenticated IPC', async () => {
    const snapshot = {
      definitions: [],
      profiles: [],
      memberships: [],
      runtimeContext: { activeProfileIds: [] },
      capabilities: { localRuntime: true },
      overrides: [],
    };
    const queryPort = {
      getConfigurationSnapshot: vi.fn().mockResolvedValue(snapshot),
      getUpcomingOccurrences: vi.fn().mockResolvedValue({ occurrences: [] }),
    } as unknown as RoutineConfigurationQueryPort;
    const commandPort = {} as RoutineCoachCommandPort;
    const module = createRoutineConfigurationElectronModule({ commandPort, queryPort });

    module.register({
      db: {} as never,
      auth: { requireRequestContext: vi.fn().mockResolvedValue({ identityId: 'identity-1' }) },
    });

    const result = await handlers.get(RoutineChannels.CONFIGURATION_GET)?.({});
    expect(queryPort.getConfigurationSnapshot).toHaveBeenCalledWith('identity-1');
    expect(result).toEqual({ ok: true, data: snapshot });

    const upcoming = await handlers.get(RoutineChannels.UPCOMING_GET)?.(
      {},
      { start: 100, end: 200, limit: 10 },
    );
    expect(queryPort.getUpcomingOccurrences).toHaveBeenCalledWith('identity-1', {
      start: 100,
      end: 200,
      limit: 10,
    });
    expect(upcoming).toEqual({ ok: true, data: { occurrences: [] } });

    module.destroy?.();
    expect(handlers.has(RoutineChannels.CONFIGURATION_GET)).toBe(false);
  });

  it('injects identity, validates canonical mutation input, and refreshes local registrations', async () => {
    const createRoutine = vi.fn().mockResolvedValue({
      routineId: 'routine-1',
      identityId: 'identity-1',
      name: 'Stand',
      version: 1,
    });
    const afterMutation = vi.fn().mockResolvedValue(undefined);
    const module = createRoutineConfigurationElectronModule({
      commandPort: { createRoutine } as unknown as RoutineCoachCommandPort,
      queryPort: {} as RoutineConfigurationQueryPort,
      afterMutation,
    });

    module.register({
      db: {} as never,
      auth: { requireRequestContext: vi.fn().mockResolvedValue({ identityId: 'identity-1' }) },
    });

    const result = await handlers.get(RoutineChannels.CREATE)?.(
      {},
      { name: 'Stand', profileIds: [], identityId: 'attacker-controlled' },
    );

    expect(result).toEqual({ ok: true, data: { id: 'routine-1', version: 1 } });
    expect(createRoutine).toHaveBeenCalledWith({
      identityId: 'identity-1',
      name: 'Stand',
      description: undefined,
      trigger: undefined,
      profileIds: [],
    });
    expect(JSON.stringify(createRoutine.mock.calls)).not.toContain('attacker-controlled');
    expect(afterMutation).toHaveBeenCalledTimes(1);

    module.destroy?.();
  });
});
