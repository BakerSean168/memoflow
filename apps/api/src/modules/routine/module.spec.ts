import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { RoutineCoachCommandPort, RoutineConfigurationQueryPort } from '@memoflow/reminder';
import type { IApiModuleContext } from '../../shared/contracts/api-module.js';
import { composeRoutineApiModule } from './module.js';

function createContext(): IApiModuleContext {
  return {
    app: {} as IApiModuleContext['app'],
    router: Router(),
    middleware: {
      auth: (req, _res, next) => {
        (req as { user?: { identityId: string } }).user = { identityId: 'identity-1' };
        next();
      },
      requireRole: () => (_req, _res, next) => next(),
    },
  };
}

async function createHttpHarness(options: {
  commandPort: RoutineCoachCommandPort;
  queryPort: RoutineConfigurationQueryPort;
}) {
  const module = composeRoutineApiModule(options);
  const context = createContext();
  module.register(context);
  const expressModule = await import('express');
  const app = expressModule.default();
  app.use(expressModule.default.json());
  app.use('/api', context.router);
  return app;
}

describe('Routine API module', () => {
  it('serves canonical configuration and keeps the retired /reminders route absent', async () => {
    const snapshot = {
      definitions: [],
      profiles: [],
      memberships: [],
      runtimeContext: { activeProfileIds: [] },
      capabilities: { localRuntime: false },
      overrides: [],
    };
    const queryPort = {
      getConfigurationSnapshot: vi.fn().mockResolvedValue(snapshot),
      getUpcomingOccurrences: vi.fn().mockResolvedValue({ occurrences: [] }),
    } as unknown as RoutineConfigurationQueryPort;
    const commandPort = {} as RoutineCoachCommandPort;
    const app = await createHttpHarness({ commandPort, queryPort });

    const response = await request(app).get('/api/routines/configuration');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(snapshot);
    expect(queryPort.getConfigurationSnapshot).toHaveBeenCalledWith('identity-1');

    const upcoming = await request(app).get('/api/routines/upcoming?start=100&end=200&limit=10');
    expect(upcoming.status).toBe(200);
    expect(upcoming.body.data).toEqual({ occurrences: [] });
    expect(queryPort.getUpcomingOccurrences).toHaveBeenCalledWith('identity-1', {
      start: 100,
      end: 200,
      limit: 10,
    });

    const legacy = await request(app).get('/api/reminders');
    expect(legacy.status).toBe(404);
  });

  it('injects authenticated identity for mutations and ignores body authority claims', async () => {
    const createRoutine = vi.fn().mockResolvedValue({
      routineId: 'routine-1',
      identityId: 'identity-1',
      name: 'Stand',
      version: 1,
    });
    const commandPort = { createRoutine } as unknown as RoutineCoachCommandPort;
    const queryPort = {
      getConfigurationSnapshot: vi.fn(),
    } as unknown as RoutineConfigurationQueryPort;
    const app = await createHttpHarness({ commandPort, queryPort });

    const response = await request(app).post('/api/routines').send({
      name: 'Stand',
      profileIds: [],
      identityId: 'attacker-controlled',
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({ id: 'routine-1', version: 1 });
    expect(createRoutine).toHaveBeenCalledWith({
      identityId: 'identity-1',
      name: 'Stand',
      description: undefined,
      trigger: undefined,
      profileIds: [],
    });
    expect(JSON.stringify(createRoutine.mock.calls)).not.toContain('attacker-controlled');
  });

  it('wires the complete configuration mutation surface to the canonical owner command port', async () => {
    const updateRoutine = vi.fn().mockResolvedValue({
      routineId: 'routine-1',
      identityId: 'identity-1',
      name: 'Stand',
      version: 2,
    });
    const deleteRoutine = vi.fn().mockResolvedValue({
      routineId: 'routine-1',
      identityId: 'identity-1',
    });
    const replaceRoutineProfiles = vi.fn().mockResolvedValue({
      routineId: 'routine-1',
      identityId: 'identity-1',
      profileIds: ['profile-1'],
      version: 3,
    });
    const setMembershipEnabled = vi.fn().mockResolvedValue({
      routineId: 'routine-1',
      identityId: 'identity-1',
      profileId: 'profile-1',
      enabled: false,
      version: 4,
    });
    const setTemporaryOverride = vi.fn().mockResolvedValue({
      routineId: 'routine-1',
      identityId: 'identity-1',
      override: null,
    });
    const clearTemporaryOverride = vi.fn().mockResolvedValue({
      routineId: 'routine-1',
      identityId: 'identity-1',
      override: null,
    });
    const createProfile = vi.fn().mockResolvedValue({
      profileId: 'profile-1',
      identityId: 'identity-1',
      name: 'Work',
      version: 1,
    });
    const updateProfile = vi.fn().mockResolvedValue({
      profileId: 'profile-1',
      identityId: 'identity-1',
      name: 'Deep Work',
      version: 2,
    });
    const deleteProfile = vi.fn().mockResolvedValue({
      profileId: 'profile-1',
      identityId: 'identity-1',
    });
    const setProfileActive = vi.fn().mockResolvedValue({
      profileId: 'profile-1',
      identityId: 'identity-1',
      active: true,
      version: 1,
    });
    const commandPort = {
      updateRoutine,
      deleteRoutine,
      replaceRoutineProfiles,
      setMembershipEnabled,
      setTemporaryOverride,
      clearTemporaryOverride,
      createProfile,
      updateProfile,
      deleteProfile,
      setProfileActive,
    } as unknown as RoutineCoachCommandPort;
    const queryPort = {
      getConfigurationSnapshot: vi.fn(),
    } as unknown as RoutineConfigurationQueryPort;
    const app = await createHttpHarness({ commandPort, queryPort });

    expect(
      (
        await request(app).patch('/api/routines/routine-1').send({
          expectedVersion: 1,
          name: 'Stand',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .put('/api/routines/routine-1/profiles')
          .send({
            expectedVersion: 2,
            profileIds: ['profile-1'],
          })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app).patch('/api/routines/routine-1/profiles/profile-1').send({
          expectedVersion: 1,
          enabled: false,
        })
      ).status,
    ).toBe(200);

    const snoozeUntil = Date.now() + 30 * 60_000;
    expect(
      (
        await request(app).put('/api/routines/routine-1/override').send({
          snoozeUntil,
          expiresAt: snoozeUntil,
          reason: 'test snooze',
        })
      ).status,
    ).toBe(200);
    expect((await request(app).delete('/api/routines/routine-1/override').send({})).status).toBe(
      200,
    );

    expect(
      (
        await request(app).post('/api/routine-profiles').send({
          name: 'Work',
          enabled: true,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app).patch('/api/routine-profiles/profile-1').send({
          expectedVersion: 1,
          name: 'Deep Work',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app).patch('/api/routine-profiles/profile-1/runtime').send({
          active: true,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app).delete('/api/routine-profiles/profile-1').send({
          expectedVersion: 2,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app).delete('/api/routines/routine-1').send({
          expectedVersion: 4,
        })
      ).status,
    ).toBe(200);

    expect(updateRoutine).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-1', routineId: 'routine-1' }),
    );
    expect(replaceRoutineProfiles).toHaveBeenCalledWith({
      identityId: 'identity-1',
      routineId: 'routine-1',
      expectedVersion: 2,
      profileIds: ['profile-1'],
    });
    expect(setMembershipEnabled).toHaveBeenCalledWith({
      identityId: 'identity-1',
      routineId: 'routine-1',
      profileId: 'profile-1',
      expectedVersion: 1,
      enabled: false,
    });
    expect(setTemporaryOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'identity-1',
        routineId: 'routine-1',
        snoozeUntil,
        source: 'user',
      }),
    );
    expect(clearTemporaryOverride).toHaveBeenCalledWith({
      identityId: 'identity-1',
      routineId: 'routine-1',
      expectedVersion: undefined,
    });
    expect(createProfile).toHaveBeenCalledWith({
      identityId: 'identity-1',
      name: 'Work',
      enabled: true,
    });
    expect(updateProfile).toHaveBeenCalledWith({
      identityId: 'identity-1',
      profileId: 'profile-1',
      expectedVersion: 1,
      name: 'Deep Work',
    });
    expect(setProfileActive).not.toHaveBeenCalled();
    expect(deleteProfile).toHaveBeenCalledWith({
      identityId: 'identity-1',
      profileId: 'profile-1',
      expectedVersion: 2,
    });
    expect(deleteRoutine).toHaveBeenCalledWith({
      identityId: 'identity-1',
      routineId: 'routine-1',
      expectedVersion: 4,
    });
  });
});
