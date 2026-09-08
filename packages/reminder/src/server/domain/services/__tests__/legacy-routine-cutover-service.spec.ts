import { describe, expect, it, vi } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import { ReminderType } from '@memoflow/contracts/reminder';
import { ReminderGroup } from '../../aggregates/reminder-group';
import { ReminderTemplate } from '../../aggregates/reminder-template';
import type { RoutineProfileStore } from '../../ports';
import { LegacyRoutineCutoverService } from '../legacy-routine-cutover-service';

function createTemplate(identityId: IdentityId) {
  return ReminderTemplate.create({
    identityId,
    title: 'Hydration',
    type: ReminderType.Recurring,
    trigger: {
      type: 'FixedTime',
      fixedTime: { time: '09:00', timezone: 'UTC' },
      interval: null,
    },
    activeTime: { activatedAt: Date.parse('2026-09-07T00:00:00.000Z') },
    notificationConfig: {
      channels: ['InApp'],
      title: null,
      body: null,
      sound: null,
      vibration: null,
      actions: null,
    },
  });
}

function createStore(overrides: Partial<RoutineProfileStore> = {}): RoutineProfileStore {
  return {
    upsertDefinition: vi.fn(async () => {}),
    findDefinition: vi.fn(async () => null),
    deleteDefinition: vi.fn(async () => {}),
    upsertProfile: vi.fn(async () => {}),
    findProfile: vi.fn(async () => null),
    listProfiles: vi.fn(async () => []),
    findProfilesByIds: vi.fn(async () => []),
    deleteProfile: vi.fn(async () => {}),
    upsertMembership: vi.fn(async () => {}),
    listMembershipsForRoutine: vi.fn(async () => []),
    listMembershipsForRoutines: vi.fn(async () => []),
    listMembershipsForProfile: vi.fn(async () => []),
    deleteMembership: vi.fn(async () => {}),
    replaceRoutineMemberships: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('LegacyRoutineCutoverService', () => {
  it('projects ReminderTemplate into RoutineDefinition without touching membership state', async () => {
    const identityId = IdentityId.generate();
    const store = createStore();
    const service = new LegacyRoutineCutoverService(store);
    const template = createTemplate(identityId);

    await service.projectTemplateDefinition(template);

    expect(store.upsertDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        id: template.id,
        identityId: String(identityId),
        enabled: true,
      }),
    );
    expect(store.replaceRoutineMemberships).not.toHaveBeenCalled();
    expect(store.upsertMembership).not.toHaveBeenCalled();
  });

  it('projects ReminderGroup metadata into a RoutineProfile without synthesizing edges', async () => {
    const identityId = IdentityId.generate();
    const store = createStore();
    const service = new LegacyRoutineCutoverService(store);
    const group = ReminderGroup.create({ identityId: String(identityId), name: 'Work' });

    await service.projectProfile(group);

    expect(store.upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: group.id,
        identityId: String(identityId),
        name: 'Work',
      }),
    );
    expect(store.replaceRoutineMemberships).not.toHaveBeenCalled();
    expect(store.upsertMembership).not.toHaveBeenCalled();
  });

  it('deletes canonical Routine and Profile projections through the store', async () => {
    const store = createStore();
    const service = new LegacyRoutineCutoverService(store);

    await service.deleteRoutine({ identityId: 'identity-1', routineId: 'routine-1' });
    await service.deleteProfile({ identityId: 'identity-1', profileId: 'profile-1' });

    expect(store.deleteDefinition).toHaveBeenCalledWith({
      identityId: 'identity-1',
      routineId: 'routine-1',
    });
    expect(store.deleteProfile).toHaveBeenCalledWith({
      identityId: 'identity-1',
      profileId: 'profile-1',
    });
  });
});
