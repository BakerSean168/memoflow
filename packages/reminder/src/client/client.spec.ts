import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { RoutineChannels } from '@memoflow/contracts/electron';
import { createRoutineHttpClient, createRoutineIpcClient } from './index';

describe('Routine client seam', () => {
  it('uses canonical Routine HTTP paths and never the retired /reminders surface', async () => {
    const http = {
      get: vi.fn().mockResolvedValue(
        ok({
          definitions: [],
          profiles: [],
          memberships: [],
          runtimeContext: { activeProfileIds: [] },
          capabilities: { localRuntime: false },
          overrides: [],
        }),
      ),
      post: vi.fn().mockResolvedValue(ok({ id: 'routine-1', version: 1 })),
      put: vi.fn().mockResolvedValue(ok({ id: 'routine-1', version: 2 })),
      patch: vi.fn().mockResolvedValue(ok({ id: 'routine-1', version: 2 })),
      delete: vi.fn().mockResolvedValue(ok({ id: 'routine-1' })),
      stream: vi.fn(),
    };
    const client = createRoutineHttpClient(http);

    await client.getConfigurationSnapshot();
    await client.getUpcomingOccurrences({ start: 100, end: 200, limit: 10 });
    await client.createRoutine({ name: 'Stand', profileIds: [] });
    await client.createProfile({ name: 'Work' });

    expect(http.get).toHaveBeenCalledWith('/routines/configuration');
    expect(http.get).toHaveBeenCalledWith('/routines/upcoming', {
      params: { start: 100, end: 200, limit: 10 },
    });
    expect(http.post).toHaveBeenCalledWith('/routines', { name: 'Stand', profileIds: [] });
    expect(http.post).toHaveBeenCalledWith('/routine-profiles', { name: 'Work' });
    expect(http.get.mock.calls.flat().join(' ')).not.toContain('/reminders');
    expect(http.post.mock.calls.flat().join(' ')).not.toContain('/reminders');
  });

  it('uses canonical Routine IPC channels', async () => {
    const ipc = {
      invoke: vi.fn().mockResolvedValue(
        ok({
          definitions: [],
          profiles: [],
          memberships: [],
          runtimeContext: { activeProfileIds: [] },
          capabilities: { localRuntime: true },
          overrides: [],
        }),
      ),
    };
    const client = createRoutineIpcClient(ipc);

    await client.getConfigurationSnapshot();
    await client.getUpcomingOccurrences({ start: 100, end: 200, limit: 10 });

    expect(ipc.invoke).toHaveBeenCalledWith(RoutineChannels.CONFIGURATION_GET);
    expect(ipc.invoke).toHaveBeenCalledWith(RoutineChannels.UPCOMING_GET, {
      start: 100,
      end: 200,
      limit: 10,
    });
  });
});
