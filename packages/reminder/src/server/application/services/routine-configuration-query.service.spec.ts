import { describe, expect, it, vi } from 'vitest';
import {
  ProfileMembership,
  RoutineDefinition,
  RoutineProfile,
  createTemporaryOverride,
} from '../../domain/routine';
import type {
  RoutineProfileStore,
  RoutineRuntimeContextStore,
  RoutineTemporaryOverrideStore,
} from '../../domain/ports';
import { createRoutineConfigurationQueryService } from './routine-configuration-query.service';

describe('RoutineConfigurationQueryService', () => {
  it('projects only canonical owner DTOs for the configuration center', async () => {
    const now = new Date('2026-09-21T08:00:00.000Z');
    const routine = RoutineDefinition.create({
      id: 'routine-1',
      identityId: 'identity-1',
      name: 'Stand',
      description: 'Move',
      trigger: {
        type: 'Elapsed',
        timingOwner: 'local-runtime',
        durationMs: 3_000_000,
        anchor: 'last-satisfied',
      },
      now,
    });
    const profile = RoutineProfile.create({
      id: 'profile-1',
      identityId: 'identity-1',
      name: 'Work',
      now,
    });
    const membership = ProfileMembership.create({
      identityId: 'identity-1',
      profileId: profile.id,
      routineId: routine.id,
      now,
    });
    const override = createTemporaryOverride({
      snoozeUntil: now.getTime() + 60_000,
      expiresAt: now.getTime() + 60_000,
      reason: 'test',
      source: 'user',
    });

    const routineProfileStore = {
      listDefinitions: vi.fn().mockResolvedValue([routine]),
      listProfiles: vi.fn().mockResolvedValue([profile]),
      listMembershipsForRoutines: vi.fn().mockResolvedValue([membership]),
    } as unknown as RoutineProfileStore;
    const runtimeContextStore = {
      get: vi.fn().mockReturnValue({ activeProfileIds: [profile.id] }),
    } as unknown as RoutineRuntimeContextStore;
    const temporaryOverrideStore = {
      findRoutineTemporaryOverride: vi.fn().mockResolvedValue(override),
    } as unknown as RoutineTemporaryOverrideStore;

    const query = createRoutineConfigurationQueryService({
      routineProfileStore,
      runtimeContextStore,
      temporaryOverrideStore,
      localRuntimeAvailable: true,
    });
    const snapshot = await query.getConfigurationSnapshot('identity-1');

    expect(snapshot.definitions).toEqual([
      expect.objectContaining({
        id: 'routine-1',
        name: 'Stand',
        enabled: true,
        version: 1,
        trigger: expect.objectContaining({ type: 'Elapsed', durationMs: 3_000_000 }),
      }),
    ]);
    expect(snapshot.profiles).toEqual([
      expect.objectContaining({ id: 'profile-1', name: 'Work', active: true }),
    ]);
    expect(snapshot.memberships).toEqual([
      expect.objectContaining({ routineId: 'routine-1', profileId: 'profile-1', enabled: true }),
    ]);
    expect(snapshot.runtimeContext).toEqual({ activeProfileIds: ['profile-1'] });
    expect(snapshot.capabilities).toEqual({ localRuntime: true });
    expect(snapshot.overrides).toEqual([
      expect.objectContaining({ routineId: 'routine-1', reason: 'test', source: 'user' }),
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('identity-1');

    expect(routineProfileStore.listMembershipsForRoutines).toHaveBeenCalledWith({
      identityId: 'identity-1',
      routineIds: ['routine-1'],
    });
    expect(temporaryOverrideStore.findRoutineTemporaryOverride).toHaveBeenCalledWith({
      identityId: 'identity-1',
      routineId: 'routine-1',
    });
  });
});
