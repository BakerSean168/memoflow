import { describe, expect, it, vi } from 'vitest';
import {
  createElapsedTrigger,
  ProfileMembership,
  RoutineDefinition,
  RoutineProfile,
} from '../../domain/routine';
import { createInMemoryProtocolSessionStore } from '../../runtime/protocol';
import type { RoutineProfileStore, RoutineTemporaryOverrideStore } from '../../domain/ports';
import { createInMemoryRoutineRuntimeContextStore } from '../../runtime/routine-runtime-context';
import { createRoutineCoachCommandService } from './routine-coach-command.service';

function profileStore(): RoutineProfileStore {
  const definitions = new Map<string, RoutineDefinition>();
  const profiles = new Map<string, RoutineProfile>();
  const membershipRows = new Map<string, ProfileMembership>();
  return {
    upsertDefinition: vi.fn(async (value) => {
      definitions.set(value.id, value);
    }),
    createDefinitionWithMemberships: vi.fn(async ({ definition, memberships: nextMemberships }) => {
      definitions.set(definition.id, definition);
      for (const membership of nextMemberships) {
        membershipRows.set(
          `${membership.identityId}:${membership.profileId}:${membership.routineId}`,
          membership,
        );
      }
    }),
    findDefinition: vi.fn(async ({ routineId }) => definitions.get(routineId) ?? null),
    deleteDefinition: vi.fn(async ({ routineId }) => {
      definitions.delete(routineId);
    }),
    upsertProfile: vi.fn(async (value) => {
      profiles.set(value.id, value);
    }),
    findProfile: vi.fn(async ({ identityId, profileId }) => {
      const profile = profiles.get(profileId);
      return profile?.identityId === identityId ? profile : null;
    }),
    listProfiles: vi.fn(async () => [...profiles.values()]),
    findProfilesByIds: vi.fn(async ({ identityId, profileIds }) =>
      profileIds.flatMap((id) => {
        const profile = profiles.get(id);
        return profile?.identityId === identityId ? [profile] : [];
      }),
    ),
    deleteProfile: vi.fn(async ({ profileId }) => {
      profiles.delete(profileId);
    }),
    upsertMembership: vi.fn(async (value) => {
      membershipRows.set(`${value.identityId}:${value.profileId}:${value.routineId}`, value);
    }),
    listMembershipsForRoutine: vi.fn(async ({ identityId, routineId }) =>
      [...membershipRows.values()].filter(
        (membership) => membership.identityId === identityId && membership.routineId === routineId,
      ),
    ),
    listMembershipsForRoutines: vi.fn(async ({ identityId, routineIds }) =>
      [...membershipRows.values()].filter(
        (membership) =>
          membership.identityId === identityId && routineIds.includes(membership.routineId),
      ),
    ),
    listMembershipsForProfile: vi.fn(async ({ identityId, profileId }) =>
      [...membershipRows.values()].filter(
        (membership) => membership.identityId === identityId && membership.profileId === profileId,
      ),
    ),
    deleteMembership: vi.fn(async ({ identityId, profileId, routineId }) => {
      membershipRows.delete(`${identityId}:${profileId}:${routineId}`);
    }),
    replaceRoutineMemberships: vi.fn(),
  };
}

function overrideStore(): RoutineTemporaryOverrideStore & { current: Map<string, unknown> } {
  const current = new Map<string, unknown>();
  return {
    current,
    setRoutineTemporaryOverride: vi.fn(async ({ identityId, routineId, override }) => {
      current.set(`${identityId}:${routineId}`, override);
    }),
    clearRoutineTemporaryOverride: vi.fn(async ({ identityId, routineId }) => {
      current.delete(`${identityId}:${routineId}`);
    }),
  };
}

describe('RoutineCoachCommandService', () => {
  it('creates a canonical RoutineDefinition and memberships atomically', async () => {
    const profiles = profileStore();
    const now = 1_000;
    await profiles.upsertProfile(
      RoutineProfile.create({ id: 'work', identityId: 'i-1', name: 'Work' }),
    );
    await profiles.upsertProfile(
      RoutineProfile.create({ id: 'study', identityId: 'i-1', name: 'Study' }),
    );
    const service = createRoutineCoachCommandService({
      routineProfileStore: profiles,
      runtimeContextStore: createInMemoryRoutineRuntimeContextStore(),
      temporaryOverrideStore: overrideStore(),
      protocolSessionStore: createInMemoryProtocolSessionStore(),
    });

    const receipt = await service.createRoutine({
      identityId: 'i-1',
      name: 'Move',
      trigger: createElapsedTrigger({ durationMs: 50 * 60_000 }),
      profileIds: ['work', 'study'],
      at: now,
    });

    expect(receipt).toMatchObject({ identityId: 'i-1', name: 'Move', version: 1 });
    expect(
      await profiles.findDefinition({ identityId: 'i-1', routineId: receipt.routineId }),
    ).toMatchObject({
      id: receipt.routineId,
      trigger: expect.objectContaining({ type: 'Elapsed', durationMs: 50 * 60_000 }),
    });
    expect(
      (
        await profiles.listMembershipsForRoutine({
          identityId: 'i-1',
          routineId: receipt.routineId,
        })
      )
        .map((membership) => membership.profileId)
        .sort(),
    ).toEqual(['study', 'work']);
  });

  it('rejects duplicate and missing profiles before durable mutation', async () => {
    const profiles = profileStore();
    await profiles.upsertProfile(
      RoutineProfile.create({ id: 'work', identityId: 'i-1', name: 'Work' }),
    );
    const service = createRoutineCoachCommandService({
      routineProfileStore: profiles,
      runtimeContextStore: createInMemoryRoutineRuntimeContextStore(),
      temporaryOverrideStore: overrideStore(),
      protocolSessionStore: createInMemoryProtocolSessionStore(),
    });

    await expect(
      service.createRoutine({ identityId: 'i-1', name: 'Move', profileIds: ['work', 'work'] }),
    ).rejects.toThrow(/Duplicate Routine profile membership/);
    await expect(
      service.createRoutine({ identityId: 'i-1', name: 'Move', profileIds: ['missing'] }),
    ).rejects.toThrow(/profiles were not found/);
    expect(profiles.createDefinitionWithMemberships).not.toHaveBeenCalled();
  });

  it('rejects a profile belonging to another identity before durable mutation', async () => {
    const profiles = profileStore();
    await profiles.upsertProfile(
      RoutineProfile.create({ id: 'foreign', identityId: 'i-2', name: 'Foreign' }),
    );
    const service = createRoutineCoachCommandService({
      routineProfileStore: profiles,
      runtimeContextStore: createInMemoryRoutineRuntimeContextStore(),
      temporaryOverrideStore: overrideStore(),
      protocolSessionStore: createInMemoryProtocolSessionStore(),
    });

    await expect(
      service.createRoutine({ identityId: 'i-1', name: 'Move', profileIds: ['foreign'] }),
    ).rejects.toThrow(/profiles were not found/);
    expect(profiles.createDefinitionWithMemberships).not.toHaveBeenCalled();
  });

  it('supports a Routine with no profile memberships', async () => {
    const profiles = profileStore();
    const service = createRoutineCoachCommandService({
      routineProfileStore: profiles,
      runtimeContextStore: createInMemoryRoutineRuntimeContextStore(),
      temporaryOverrideStore: overrideStore(),
      protocolSessionStore: createInMemoryProtocolSessionStore(),
    });

    const receipt = await service.createRoutine({ identityId: 'i-1', name: 'Move' });
    expect(receipt.name).toBe('Move');
    expect(
      await profiles.listMembershipsForRoutine({ identityId: 'i-1', routineId: receipt.routineId }),
    ).toEqual([]);
  });

  it('activates a profile without mutating memberships and notifies the runtime', async () => {
    const profiles = profileStore();
    const profile = RoutineProfile.create({ id: 'work', identityId: 'i-1', name: 'Work' });
    await profiles.upsertProfile(profile);
    const runtimeContextStore = createInMemoryRoutineRuntimeContextStore();
    const profileActiveChanged = vi.fn();
    const service = createRoutineCoachCommandService({
      routineProfileStore: profiles,
      runtimeContextStore,
      temporaryOverrideStore: overrideStore(),
      protocolSessionStore: createInMemoryProtocolSessionStore(),
      now: () => 1_000,
      onProfileActiveChanged: async (input) => {
        profileActiveChanged(input);
        expect(runtimeContextStore.get({ identityId: input.identityId })).toEqual({
          activeProfileIds: input.active ? ['work'] : [],
        });
      },
    });

    await expect(
      service.setProfileActive({ identityId: 'i-1', profileId: 'work', active: true }),
    ).resolves.toMatchObject({ profileId: 'work', active: true, version: 1 });
    expect(profile.enabled).toBe(true);
    expect(profile.version).toBe(1);
    expect(profiles.upsertProfile).toHaveBeenCalledTimes(1);
    expect(profileActiveChanged).toHaveBeenCalledWith({
      identityId: 'i-1',
      profileId: 'work',
      active: true,
    });
    expect(
      (await service.setProfileActive({ identityId: 'i-1', profileId: 'work', active: false }))
        .version,
    ).toBe(2);
    expect(profiles.replaceRoutineMemberships).not.toHaveBeenCalled();
  });

  it('persists an AI temporary override and emits only the owner-domain change callback', async () => {
    const profiles = profileStore();
    await profiles.upsertDefinition(
      RoutineDefinition.create({ id: 'r-1', identityId: 'i-1', name: 'Move' }),
    );
    const overrides = overrideStore();
    const changed = vi.fn();
    const service = createRoutineCoachCommandService({
      routineProfileStore: profiles,
      runtimeContextStore: createInMemoryRoutineRuntimeContextStore(),
      temporaryOverrideStore: overrides,
      protocolSessionStore: createInMemoryProtocolSessionStore(),
      onOverrideChanged: changed,
    });

    const result = await service.setTemporaryOverride({
      identityId: 'i-1',
      routineId: 'r-1',
      suppressUntil: 2_000,
      expiresAt: 2_000,
      reason: 'focus for now',
    });
    expect(result.override?.source).toBe('ai');
    expect(changed).toHaveBeenCalledWith({ identityId: 'i-1', routineId: 'r-1' });
  });

  it('starts a Pomodoro through the deterministic ProtocolSession runtime', async () => {
    const sessions = createInMemoryProtocolSessionStore();
    const service = createRoutineCoachCommandService({
      routineProfileStore: profileStore(),
      runtimeContextStore: createInMemoryRoutineRuntimeContextStore(),
      temporaryOverrideStore: overrideStore(),
      protocolSessionStore: sessions,
      now: () => 1_000,
    });

    const started = await service.startPresetProtocol({ identityId: 'i-1', methodId: 'pomodoro' });
    expect(started).toMatchObject({ identityId: 'i-1', state: 'Running' });
    const persisted = await sessions.findById({ identityId: 'i-1', sessionId: started.sessionId });
    expect(persisted?.snapshot().protocolSnapshot.cyclePolicy.cycles).toBe(4);
    expect(persisted?.snapshot().protocolSnapshot.breakPolicy.longBreakDurationMs).toBe(
      15 * 60_000,
    );
  });

  it('pauses, resumes and ends an existing protocol session through one fenced runtime', async () => {
    const sessions = createInMemoryProtocolSessionStore();
    const service = createRoutineCoachCommandService({
      routineProfileStore: profileStore(),
      runtimeContextStore: createInMemoryRoutineRuntimeContextStore(),
      temporaryOverrideStore: overrideStore(),
      protocolSessionStore: sessions,
      now: () => 1_000,
    });
    const started = await service.startPresetProtocol({
      identityId: 'i-1',
      methodId: '50-10-protocol',
    });
    await expect(
      service.transitionProtocol({
        identityId: 'i-1',
        sessionId: started.sessionId,
        action: 'pause',
        at: 2_000,
      }),
    ).resolves.toMatchObject({ state: 'Paused' });
    await expect(
      service.transitionProtocol({
        identityId: 'i-1',
        sessionId: started.sessionId,
        action: 'resume',
        at: 3_000,
      }),
    ).resolves.toMatchObject({ state: 'Running' });
    await expect(
      service.transitionProtocol({
        identityId: 'i-1',
        sessionId: started.sessionId,
        action: 'end',
        at: 4_000,
      }),
    ).resolves.toMatchObject({ state: 'Completed' });
  });
});
