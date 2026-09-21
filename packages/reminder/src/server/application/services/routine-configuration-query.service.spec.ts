import { describe, expect, it, vi } from 'vitest';
import {
  ProfileMembership,
  RoutineDefinition,
  RoutineProfile,
  createTemporaryOverride,
  createWallClockTrigger,
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

  it('projects bounded sorted canonical WallClock occurrences for Home and Planner', async () => {
    const now = new Date('2026-09-21T00:00:00.000Z');
    const routine = RoutineDefinition.create({
      id: 'routine-wall-clock',
      identityId: 'identity-1',
      name: 'Drink water',
      description: 'Hydrate',
      trigger: createWallClockTrigger({
        localTime: '09:30',
        timeZone: 'Asia/Shanghai',
        recurrence: { startDate: '2026-09-21', frequency: 'daily', interval: 1 },
      }),
      now,
    });
    const routineProfileStore = {
      listDefinitions: vi.fn().mockResolvedValue([routine]),
      listMembershipsForRoutines: vi.fn().mockResolvedValue([]),
      findProfilesByIds: vi.fn().mockResolvedValue([]),
    } as unknown as RoutineProfileStore;
    const runtimeContextStore = { get: vi.fn() } as unknown as RoutineRuntimeContextStore;
    const temporaryOverrideStore = {
      findRoutineTemporaryOverride: vi.fn().mockResolvedValue(null),
    } as unknown as RoutineTemporaryOverrideStore;
    const query = createRoutineConfigurationQueryService({
      routineProfileStore,
      runtimeContextStore,
      temporaryOverrideStore,
    });

    const start = Date.parse('2026-09-21T00:00:00.000Z');
    const end = Date.parse('2026-09-22T23:59:59.999Z');
    const result = await query.getUpcomingOccurrences('identity-1', { start, end, limit: 10 });

    expect(result.occurrences).toEqual([
      expect.objectContaining({
        identityId: 'identity-1',
        routineId: 'routine-wall-clock',
        title: 'Drink water',
        occurrenceAt: Date.parse('2026-09-21T01:30:00.000Z'),
        editable: false,
      }),
      expect.objectContaining({
        occurrenceAt: Date.parse('2026-09-22T01:30:00.000Z'),
        editable: false,
      }),
    ]);
    expect(result.occurrences[0]?.occurrenceKey).toBe(
      `routine:routine-wall-clock:oc:${Date.parse('2026-09-21T01:30:00.000Z')}`,
    );
  });
  it('suppresses WallClock owner reads when every durable Profile/Membership path is gated off', async () => {
    const now = new Date('2026-09-21T00:00:00.000Z');
    const routine = RoutineDefinition.create({
      id: 'routine-profiled',
      identityId: 'identity-1',
      name: 'Work break',
      trigger: createWallClockTrigger({
        localTime: '09:30',
        timeZone: 'Asia/Shanghai',
        recurrence: { startDate: '2026-09-21', frequency: 'daily', interval: 1 },
      }),
      now,
    });
    const profile = RoutineProfile.create({
      id: 'profile-disabled',
      identityId: 'identity-1',
      name: 'Work',
      enabled: false,
      now,
    });
    const membership = ProfileMembership.create({
      identityId: 'identity-1',
      profileId: profile.id,
      routineId: routine.id,
      now,
    });
    const routineProfileStore = {
      listDefinitions: vi.fn().mockResolvedValue([routine]),
      listMembershipsForRoutines: vi.fn().mockResolvedValue([membership]),
      findProfilesByIds: vi.fn().mockResolvedValue([profile]),
    } as unknown as RoutineProfileStore;
    const query = createRoutineConfigurationQueryService({
      routineProfileStore,
      runtimeContextStore: { get: vi.fn() } as unknown as RoutineRuntimeContextStore,
      temporaryOverrideStore: {
        findRoutineTemporaryOverride: vi.fn().mockResolvedValue(null),
      } as unknown as RoutineTemporaryOverrideStore,
    });

    const result = await query.getUpcomingOccurrences('identity-1', {
      start: Date.parse('2026-09-21T00:00:00.000Z'),
      end: Date.parse('2026-09-22T23:59:59.999Z'),
      limit: 10,
    });

    expect(result.occurrences).toEqual([]);
  });
});
