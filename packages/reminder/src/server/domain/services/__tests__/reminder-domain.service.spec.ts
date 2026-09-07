import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IReminderTemplateRepository } from '../../repositories/i-reminder-template-repository';
import type { IReminderGroupRepository } from '../../repositories/i-reminder-group-repository';
import type { RoutineProfileStore } from '../../ports';
import { ReminderDomainService } from '../reminder-domain-service';
import { ReminderTemplate } from '../../aggregates/reminder-template';
import type { ReminderTemplateState } from '../../aggregates/reminder-template';
import { ReminderGroup } from '../../aggregates/reminder-group';
import type { ReminderGroupState } from '../../aggregates/reminder-group';
import { ReminderStatus, ReminderType } from '@memoflow/contracts/reminder';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { ReminderTemplateId } from '../../value-objects/reminder-template-id';
import { IdentityId } from '@memoflow/domain-shared';
import { TriggerConfig, ActiveTimeConfig, GroupStats } from '../../value-objects';
import { ReminderNotificationConfig } from '../../value-objects/reminder-notification-config';
import { generateUUID } from '@memoflow/utils/shared';
import { ProfileMembership, RoutineProfile } from '../../routine';

const IDENTITY_ID = String(IdentityId.generate());

function makeTemplateState(overrides: Partial<ReminderTemplateState> = {}): ReminderTemplateState {
  const now = Date.now();
  return {
    id: ReminderTemplateId.generate(),
    identityId: IdentityId.of(IDENTITY_ID),
    title: 'Domain Svc Test',
    description: null,
    type: ReminderType.Recurring,
    trigger: TriggerConfig.createFixedTime('08:00'),
    activeTime: ActiveTimeConfig.createAt(now),
    activeHours: null,
    notificationConfig: ReminderNotificationConfig.createDefault(),
    selfEnabled: true,
    status: ReminderStatus.Active,
    effectiveEnabled: true,
    importanceLevel: ImportanceLevel.Moderate,
    tags: [],
    color: null,
    icon: null,
    nextTriggerAt: now + 3_600_000,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    history: [],
    ...overrides,
  };
}

function makeGroupState(overrides: Partial<ReminderGroupState> = {}): ReminderGroupState {
  const now = new Date();
  return {
    id: generateUUID(),
    identityId: IDENTITY_ID,
    name: 'Work',
    description: null,
    enabled: true,
    status: ReminderStatus.Active,
    order: 0,
    color: null,
    icon: null,
    stats: GroupStats.createEmpty(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    ...overrides,
  };
}

function makeCreateInput(profileIds: readonly string[] = []) {
  return {
    identityId: IDENTITY_ID,
    title: 'Hydration',
    type: ReminderType.Recurring,
    trigger: {
      type: 'FixedTime' as const,
      fixedTime: { time: '09:00', timezone: 'UTC' },
      interval: null,
    },
    activeTime: { activatedAt: Date.now() },
    notificationConfig: {
      channels: ['InApp'] as const,
      title: null,
      body: null,
      sound: null,
      vibration: null,
      actions: null,
    },
    profileIds,
  };
}

function createInMemoryStore() {
  let profiles: RoutineProfile[] = [];
  let memberships: ProfileMembership[] = [];

  const store: RoutineProfileStore = {
    upsertDefinition: vi.fn(async () => {}),
    findDefinition: vi.fn(async () => null),
    deleteDefinition: vi.fn(async () => {}),
    upsertProfile: vi.fn(async (profile: RoutineProfile) => {
      profiles = [...profiles.filter((item) => item.id !== profile.id), profile];
    }),
    findProfile: vi.fn(async ({ identityId, profileId }) =>
      profiles.find((item) => item.identityId === identityId && item.id === profileId) ?? null,
    ),
    listProfiles: vi.fn(async ({ identityId }) =>
      profiles.filter((item) => item.identityId === identityId),
    ),
    findProfilesByIds: vi.fn(async ({ identityId, profileIds }) =>
      profiles.filter((item) => item.identityId === identityId && profileIds.includes(item.id)),
    ),
    deleteProfile: vi.fn(async ({ identityId, profileId }) => {
      profiles = profiles.filter(
        (item) => !(item.identityId === identityId && item.id === profileId),
      );
      memberships = memberships.filter(
        (item) => !(item.identityId === identityId && item.profileId === profileId),
      );
    }),
    upsertMembership: vi.fn(async (membership: ProfileMembership) => {
      memberships = [
        ...memberships.filter(
          (item) =>
            !(
              item.identityId === membership.identityId &&
              item.profileId === membership.profileId &&
              item.routineId === membership.routineId
            ),
        ),
        membership,
      ];
    }),
    listMembershipsForRoutine: vi.fn(async ({ identityId, routineId }) =>
      memberships.filter(
        (item) => item.identityId === identityId && item.routineId === routineId,
      ),
    ),
    listMembershipsForRoutines: vi.fn(async ({ identityId, routineIds }) =>
      memberships.filter(
        (item) => item.identityId === identityId && routineIds.includes(item.routineId),
      ),
    ),
    listMembershipsForProfile: vi.fn(async ({ identityId, profileId }) =>
      memberships.filter(
        (item) => item.identityId === identityId && item.profileId === profileId,
      ),
    ),
    deleteMembership: vi.fn(async ({ identityId, profileId, routineId }) => {
      memberships = memberships.filter(
        (item) =>
          !(
            item.identityId === identityId &&
            item.profileId === profileId &&
            item.routineId === routineId
          ),
      );
    }),
    replaceRoutineMemberships: vi.fn(async ({ identityId, routineId, memberships: next }) => {
      memberships = [
        ...memberships.filter(
          (item) => !(item.identityId === identityId && item.routineId === routineId),
        ),
        ...next,
      ];
    }),
  };

  return {
    store,
    getMemberships: () => memberships,
  };
}

describe('ReminderDomainService', () => {
  let templateRepo: ReturnType<typeof createMockRepo<IReminderTemplateRepository>>;
  let groupRepo: ReturnType<typeof createMockRepo<IReminderGroupRepository>>;
  let routineStore: ReturnType<typeof createInMemoryStore>;
  let service: ReminderDomainService;

  beforeEach(() => {
    vi.clearAllMocks();
    templateRepo = createMockRepo<IReminderTemplateRepository>({
      save: vi.fn().mockResolvedValue(undefined),
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
      findByIdentityId: vi.fn().mockResolvedValue([]),
      findByIds: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    groupRepo = createMockRepo<IReminderGroupRepository>({
      save: vi.fn().mockResolvedValue(undefined),
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
      findByName: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    routineStore = createInMemoryStore();
    service = new ReminderDomainService(templateRepo, groupRepo, undefined, routineStore.store);
  });

  it('creates a Routine and persists an empty canonical membership set by default', async () => {
    const template = await service.createReminderTemplate(makeCreateInput());

    expect(template.title).toBe('Hydration');
    expect(routineStore.store.upsertDefinition).toHaveBeenCalled();
    expect(routineStore.store.replaceRoutineMemberships).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: IDENTITY_ID,
        routineId: template.id,
        memberships: [],
      }),
    );
    expect(templateRepo.save).toHaveBeenCalledWith(template);
  });

  it('creates an M:N ProfileMembership set and never consults a single Group owner', async () => {
    const work = RoutineProfile.create({
      id: 'work', identityId: IDENTITY_ID, name: 'Work', enabled: true, active: true,
    });
    const gaming = RoutineProfile.create({
      id: 'gaming', identityId: IDENTITY_ID, name: 'Gaming', enabled: true, active: true,
    });
    await routineStore.store.upsertProfile(work);
    await routineStore.store.upsertProfile(gaming);

    const template = await service.createReminderTemplate(makeCreateInput(['work', 'gaming']));
    const memberships = routineStore.getMemberships().filter((item) => item.routineId === template.id);

    expect(memberships.map((item) => item.profileId).sort()).toEqual(['gaming', 'work']);
    expect(groupRepo.findByIdForIdentity).not.toHaveBeenCalled();
  });

  it('fails closed when any requested Profile is missing', async () => {
    await routineStore.store.upsertProfile(
      RoutineProfile.create({ id: 'work', identityId: IDENTITY_ID, name: 'Work' }),
    );

    await expect(
      service.createReminderTemplate(makeCreateInput(['work', 'missing'])),
    ).rejects.toThrow('Routine Profile not found: missing');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('recalculates Profile stats from canonical memberships', async () => {
    const group = ReminderGroup.load(makeGroupState());
    const template = ReminderTemplate.load(makeTemplateState());
    await routineStore.store.upsertProfile(
      RoutineProfile.create({ id: group.id, identityId: IDENTITY_ID, name: group.name }),
    );
    await routineStore.store.upsertMembership(
      ProfileMembership.create({
        identityId: IDENTITY_ID,
        profileId: group.id,
        routineId: template.id,
      }),
    );
    (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(group);
    (templateRepo.findByIds as ReturnType<typeof vi.fn>).mockResolvedValue([template]);

    await service.updateGroupStats(IDENTITY_ID, group.id);

    expect(templateRepo.findByIds).toHaveBeenCalledWith(IDENTITY_ID, [template.id]);
    expect(group.stats).toMatchObject({
      totalTemplates: 1,
      activeTemplates: 1,
      pausedTemplates: 0,
      selfEnabledTemplates: 1,
      selfPausedTemplates: 0,
    });
    expect(groupRepo.save).toHaveBeenCalledWith(group);
  });

  it('refuses to delete a Profile while canonical memberships still reference it', async () => {
    const group = ReminderGroup.load(makeGroupState());
    const template = ReminderTemplate.load(makeTemplateState());
    (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(group);
    (templateRepo.findByIds as ReturnType<typeof vi.fn>).mockResolvedValue([template]);
    await routineStore.store.upsertMembership(
      ProfileMembership.create({ identityId: IDENTITY_ID, profileId: group.id, routineId: template.id }),
    );

    await expect(service.deleteGroup(IDENTITY_ID, group.id)).rejects.toThrow(
      /still contains 1 Routine memberships/,
    );
  });

  it('soft- and hard-deletes an empty Profile and removes its canonical projection', async () => {
    const soft = ReminderGroup.load(makeGroupState({ id: 'profile-soft' }));
    (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(soft);
    await service.deleteGroup(IDENTITY_ID, soft.id);
    expect(soft.deletedAt).not.toBeNull();
    expect(groupRepo.save).toHaveBeenCalledWith(soft);
    expect(routineStore.store.deleteProfile).toHaveBeenCalledWith({
      identityId: IDENTITY_ID,
      profileId: soft.id,
    });

    const hard = ReminderGroup.load(makeGroupState({ id: 'profile-hard' }));
    (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(hard);
    await service.deleteGroup(IDENTITY_ID, hard.id, false);
    expect(groupRepo.delete).toHaveBeenCalledWith(IDENTITY_ID, hard.id);
  });

  it('recalculates member eligibility after a Profile gate toggles', async () => {
    const group = ReminderGroup.load(makeGroupState({ id: 'work', enabled: true, status: ReminderStatus.Active }));
    const template = ReminderTemplate.load(makeTemplateState());
    await routineStore.store.upsertProfile(
      RoutineProfile.create({ id: group.id, identityId: IDENTITY_ID, name: group.name, enabled: true, active: true }),
    );
    await routineStore.store.upsertMembership(
      ProfileMembership.create({ identityId: IDENTITY_ID, profileId: group.id, routineId: template.id }),
    );
    (groupRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(group);
    (templateRepo.findByIds as ReturnType<typeof vi.fn>).mockResolvedValue([template]);

    await service.toggleGroupAndTemplates(IDENTITY_ID, group.id);

    expect(group.enabled).toBe(false);
    expect(template.selfEnabled).toBe(true);
    expect(template.effectiveEnabled).toBe(false);
    expect(template.pullDomainEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'reminder:template-eligibility-changed',
          payload: expect.objectContaining({ cause: 'profile-gate' }),
        }),
      ]),
    );
    expect(templateRepo.save).toHaveBeenCalledWith(template);
  });

  it('deletes a Routine without requiring any single owner field', async () => {
    const template = ReminderTemplate.load(makeTemplateState());
    (templateRepo.findByIdForIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(template);

    await service.deleteTemplate(IDENTITY_ID, template.id);

    expect(template.deletedAt).not.toBeNull();
    expect(templateRepo.save).toHaveBeenCalledWith(template);
    expect(routineStore.store.deleteDefinition).toHaveBeenCalledWith({
      identityId: IDENTITY_ID,
      routineId: template.id,
    });
  });

  it('creates a Profile projection and rejects duplicate names', async () => {
    const group = await service.createReminderGroup({ identityId: IDENTITY_ID, name: 'Focus' });
    expect(routineStore.store.upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: group.id, name: 'Focus' }),
    );

    (groupRepo.findByName as ReturnType<typeof vi.fn>).mockResolvedValue(group);
    await expect(
      service.createReminderGroup({ identityId: IDENTITY_ID, name: 'Focus' }),
    ).rejects.toThrow('already exists');
  });
});
