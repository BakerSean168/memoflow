import { describe, expect, it, vi } from 'vitest';
import { RoutineDefinition, RoutineProfile } from '../../domain/routine';
import { createInMemoryProtocolSessionStore } from '../../runtime/protocol';
import type { RoutineProfileStore, RoutineTemporaryOverrideStore } from '../../domain/ports';
import { createRoutineCoachCommandService } from './routine-coach-command.service';

function profileStore(): RoutineProfileStore {
  const definitions = new Map<string, RoutineDefinition>();
  const profiles = new Map<string, RoutineProfile>();
  return {
    upsertDefinition: vi.fn(async (value) => { definitions.set(value.id, value); }),
    findDefinition: vi.fn(async ({ routineId }) => definitions.get(routineId) ?? null),
    deleteDefinition: vi.fn(async ({ routineId }) => { definitions.delete(routineId); }),
    upsertProfile: vi.fn(async (value) => { profiles.set(value.id, value); }),
    findProfile: vi.fn(async ({ profileId }) => profiles.get(profileId) ?? null),
    listProfiles: vi.fn(async () => [...profiles.values()]),
    findProfilesByIds: vi.fn(async ({ profileIds }) => profileIds.flatMap((id) => profiles.get(id) ?? [])),
    deleteProfile: vi.fn(async ({ profileId }) => { profiles.delete(profileId); }),
    upsertMembership: vi.fn(),
    listMembershipsForRoutine: vi.fn(async () => []),
    listMembershipsForRoutines: vi.fn(async () => []),
    listMembershipsForProfile: vi.fn(async () => []),
    deleteMembership: vi.fn(),
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
  it('activates a profile without mutating memberships', async () => {
    const profiles = profileStore();
    const profile = RoutineProfile.create({ id: 'work', identityId: 'i-1', name: 'Work' });
    await profiles.upsertProfile(profile);
    const service = createRoutineCoachCommandService({
      routineProfileStore: profiles,
      temporaryOverrideStore: overrideStore(),
      protocolSessionStore: createInMemoryProtocolSessionStore(),
      now: () => 1_000,
    });

    await expect(service.setProfileActive({ identityId: 'i-1', profileId: 'work', active: true }))
      .resolves.toMatchObject({ profileId: 'work', active: true, version: 2 });
    expect(profiles.replaceRoutineMemberships).not.toHaveBeenCalled();
  });

  it('persists an AI temporary override and emits only the owner-domain change callback', async () => {
    const profiles = profileStore();
    await profiles.upsertDefinition(RoutineDefinition.create({ id: 'r-1', identityId: 'i-1', name: 'Move' }));
    const overrides = overrideStore();
    const changed = vi.fn();
    const service = createRoutineCoachCommandService({
      routineProfileStore: profiles,
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
      temporaryOverrideStore: overrideStore(),
      protocolSessionStore: sessions,
      now: () => 1_000,
    });

    const started = await service.startPresetProtocol({ identityId: 'i-1', methodId: 'pomodoro' });
    expect(started).toMatchObject({ identityId: 'i-1', state: 'Running' });
    const persisted = await sessions.findById({ identityId: 'i-1', sessionId: started.sessionId });
    expect(persisted?.snapshot().protocolSnapshot.cyclePolicy.cycles).toBe(4);
    expect(persisted?.snapshot().protocolSnapshot.breakPolicy.longBreakDurationMs).toBe(15 * 60_000);
  });

  it('pauses, resumes and ends an existing protocol session through one fenced runtime', async () => {
    const sessions = createInMemoryProtocolSessionStore();
    const service = createRoutineCoachCommandService({
      routineProfileStore: profileStore(),
      temporaryOverrideStore: overrideStore(),
      protocolSessionStore: sessions,
      now: () => 1_000,
    });
    const started = await service.startPresetProtocol({ identityId: 'i-1', methodId: '50-10-protocol' });
    await expect(service.transitionProtocol({ identityId: 'i-1', sessionId: started.sessionId, action: 'pause', at: 2_000 }))
      .resolves.toMatchObject({ state: 'Paused' });
    await expect(service.transitionProtocol({ identityId: 'i-1', sessionId: started.sessionId, action: 'resume', at: 3_000 }))
      .resolves.toMatchObject({ state: 'Running' });
    await expect(service.transitionProtocol({ identityId: 'i-1', sessionId: started.sessionId, action: 'end', at: 4_000 }))
      .resolves.toMatchObject({ state: 'Completed' });
  });
});
