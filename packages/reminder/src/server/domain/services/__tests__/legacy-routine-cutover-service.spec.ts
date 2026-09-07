import { describe, expect, it, vi } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import { ReminderType } from '@memoflow/contracts/reminder';
import { ReminderGroup } from '../../aggregates/reminder-group';
import { ReminderTemplate } from '../../aggregates/reminder-template';
import type { RoutineProfileStore } from '../../ports';
import { ProfileMembership } from '../../routine';
import { LegacyRoutineCutoverService } from '../legacy-routine-cutover-service';

function createTemplate(identityId: IdentityId, groupId?: string) {
  return ReminderTemplate.create({
    identityId,
    title: 'Hydration',
    type: ReminderType.Recurring,
    groupId,
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
    deleteProfile: vi.fn(async () => {}),
    upsertMembership: vi.fn(async () => {}),
    listMembershipsForRoutine: vi.fn(async () => []),
    listMembershipsForProfile: vi.fn(async () => []),
    deleteMembership: vi.fn(async () => {}),
    replaceRoutineMemberships: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('LegacyRoutineCutoverService', () => {
  it('projects ordinary Routine edits without touching membership state', async () => {
    const identityId = IdentityId.generate();
    const store = createStore();
    const service = new LegacyRoutineCutoverService(store);
    const template = createTemplate(identityId);

    await service.projectTemplateDefinition(template);

    expect(store.upsertDefinition).toHaveBeenCalledTimes(1);
    expect(store.replaceRoutineMemberships).not.toHaveBeenCalled();
    expect(store.upsertMembership).not.toHaveBeenCalled();
  });

  it('maps a legacy single-group command to one canonical ProfileMembership', async () => {
    const identityId = IdentityId.generate();
    const group = ReminderGroup.create({ identityId: String(identityId), name: 'Work' });
    const template = createTemplate(identityId, group.id);
    const store = createStore();
    const service = new LegacyRoutineCutoverService(store);

    await service.replaceLegacySingleMembership({ template, group });

    expect(store.upsertDefinition).toHaveBeenCalledTimes(1);
    expect(store.upsertProfile).toHaveBeenCalledTimes(1);
    expect(store.replaceRoutineMemberships).toHaveBeenCalledWith({
      identityId: String(identityId),
      routineId: template.id,
      memberships: [
        expect.objectContaining({
          identityId: String(identityId),
          profileId: group.id,
          routineId: template.id,
          enabled: true,
        }),
      ],
    });
  });

  it('heals an interrupted legacy create without collapsing an existing M:N membership set', async () => {
    const identityId = IdentityId.generate();
    const group = ReminderGroup.create({ identityId: String(identityId), name: 'Legacy Work' });
    const template = createTemplate(identityId, group.id);
    const existingMemberships = [
      ProfileMembership.create({
        identityId: String(identityId),
        profileId: 'work',
        routineId: template.id,
      }),
      ProfileMembership.create({
        identityId: String(identityId),
        profileId: 'gaming',
        routineId: template.id,
      }),
    ];
    const store = createStore({
      listMembershipsForRoutine: vi.fn(async () => existingMemberships),
    });
    const service = new LegacyRoutineCutoverService(store);

    await service.healLegacyProjection({ template, group });

    expect(store.upsertDefinition).toHaveBeenCalledTimes(1);
    expect(store.upsertProfile).toHaveBeenCalledTimes(1);
    expect(store.upsertMembership).not.toHaveBeenCalled();
    expect(store.replaceRoutineMemberships).not.toHaveBeenCalled();
  });

  it('synthesizes the missing legacy membership only when no canonical edge exists', async () => {
    const identityId = IdentityId.generate();
    const group = ReminderGroup.create({ identityId: String(identityId), name: 'Work' });
    const template = createTemplate(identityId, group.id);
    const store = createStore();
    const service = new LegacyRoutineCutoverService(store);

    await service.healLegacyProjection({ template, group });

    expect(store.upsertMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: String(identityId),
        profileId: group.id,
        routineId: template.id,
      }),
    );
    expect(store.replaceRoutineMemberships).not.toHaveBeenCalled();
  });

  it('rejects a legacy group owned by another identity', async () => {
    const identityId = IdentityId.generate();
    const template = createTemplate(identityId);
    const foreignGroup = ReminderGroup.create({
      identityId: String(IdentityId.generate()),
      name: 'Foreign',
    });
    const service = new LegacyRoutineCutoverService(createStore());

    await expect(
      service.replaceLegacySingleMembership({ template, group: foreignGroup }),
    ).rejects.toThrow(/ownership mismatch/);
  });
});
