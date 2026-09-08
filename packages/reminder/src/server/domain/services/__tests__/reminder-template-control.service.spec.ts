import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReminderStatus, ReminderType } from '@memoflow/contracts/reminder';
import { IdentityId } from '@memoflow/domain-shared';
import { ReminderTemplate } from '../../aggregates/reminder-template';
import type { RoutineProfileStore } from '../../ports';
import { ProfileMembership, RoutineProfile } from '../../routine';
import { ReminderTemplateControlService } from '../reminder-template-control-service';

function createTemplate(
  overrides: {
    identityId?: IdentityId;
    status?: ReminderStatus;
  } = {},
) {
  const template = ReminderTemplate.create({
    identityId: overrides.identityId ?? IdentityId.generate(),
    title: 'Template',
    type: ReminderType.Recurring,
    trigger: {
      type: 'FixedTime',
      fixedTime: { time: '09:00', timezone: null },
      interval: null,
    },
    activeTime: { activatedAt: Date.now() - 60_000 },
    notificationConfig: {
      channels: ['InApp'],
      title: null,
      body: null,
      sound: null,
      vibration: null,
      actions: null,
    },
  });

  if (overrides.status === ReminderStatus.Paused) template.pause();
  return template;
}

function createProfile(
  identityId: string,
  input: {
    id: string;
    name: string;
    enabled?: boolean;
    active?: boolean;
  },
) {
  return RoutineProfile.create({
    id: input.id,
    identityId,
    name: input.name,
    enabled: input.enabled ?? true,
    active: input.active ?? true,
  });
}

describe('ReminderTemplateControlService -> canonical ProfileMembership gate', () => {
  const templateRepository = {
    findByIdentityId: vi.fn(),
  } as any;
  const preferenceRepository = {
    findByIdentityId: vi.fn(),
  } as any;

  let memberships: ProfileMembership[];
  let profiles: RoutineProfile[];
  let routineProfileStore: RoutineProfileStore;
  let service: ReminderTemplateControlService;

  beforeEach(() => {
    vi.clearAllMocks();
    memberships = [];
    profiles = [];
    preferenceRepository.findByIdentityId.mockResolvedValue(null);
    routineProfileStore = {
      listMembershipsForRoutines: vi.fn(async ({ identityId, routineIds }) =>
        memberships.filter(
          (membership) =>
            membership.identityId === identityId && routineIds.includes(membership.routineId),
        ),
      ),
      findProfilesByIds: vi.fn(async ({ identityId, profileIds }) =>
        profiles.filter(
          (profile) => profile.identityId === identityId && profileIds.includes(profile.id),
        ),
      ),
    } as unknown as RoutineProfileStore;
    service = new ReminderTemplateControlService(
      templateRepository,
      preferenceRepository,
      routineProfileStore,
    );
  });

  it('folds the identity-wide switch into the Routine gate', async () => {
    const template = createTemplate();
    preferenceRepository.findByIdentityId.mockResolvedValue({ globalReminderEnabled: false });

    const result = await service.calculateEffectiveStatus(template);

    expect(result.effectiveStatus).toBe(ReminderStatus.Paused);
    expect(result.isEffectivelyEnabled).toBe(false);
    expect(result.lifecycleSource).toBe('global');
    expect(result.profileMemberships).toEqual([]);
  });

  it('uses neutral Profile gates for an unprofiled Routine', async () => {
    const active = await service.calculateEffectiveStatus(createTemplate());
    const paused = await service.calculateEffectiveStatus(
      createTemplate({ status: ReminderStatus.Paused }),
    );

    expect(active.effectiveStatus).toBe(ReminderStatus.Active);
    expect(active.lifecycleSource).toBe('routine');
    expect(active.statusReason).toContain('未加入 Profile');
    expect(paused.effectiveStatus).toBe(ReminderStatus.Paused);
  });

  it('fails closed for an orphaned membership whose Profile is unavailable', async () => {
    const template = createTemplate();
    memberships = [
      ProfileMembership.create({
        identityId: String(template.identityId),
        profileId: 'missing-profile',
        routineId: template.id,
      }),
    ];

    const result = await service.calculateEffectiveStatus(template);

    expect(result.isEffectivelyEnabled).toBe(false);
    expect(result.lifecycleSource).toBe('profile');
    expect(result.profileMemberships).toEqual([
      expect.objectContaining({
        profileId: 'missing-profile',
        profileName: null,
        profileEnabled: false,
        profileActive: false,
        effectiveEnabled: false,
      }),
    ]);
  });

  it('Profile OFF disables its path without changing membership-local enabled state', async () => {
    const template = createTemplate();
    const identityId = String(template.identityId);
    profiles = [createProfile(identityId, { id: 'work', name: 'Work', active: false })];
    memberships = [
      ProfileMembership.create({
        identityId,
        profileId: 'work',
        routineId: template.id,
        enabled: true,
      }),
    ];

    const result = await service.calculateEffectiveStatus(template);

    expect(memberships[0]?.enabled).toBe(true);
    expect(result.isEffectivelyEnabled).toBe(false);
    expect(result.profileMemberships[0]).toMatchObject({
      profileId: 'work',
      enabled: true,
      profileActive: false,
      effectiveEnabled: false,
    });
  });

  it('any enabled ProfileMembership path is sufficient for an M:N Routine', async () => {
    const template = createTemplate();
    const identityId = String(template.identityId);
    profiles = [
      createProfile(identityId, { id: 'work', name: 'Work', active: false }),
      createProfile(identityId, { id: 'gaming', name: 'Gaming', active: true }),
    ];
    memberships = [
      ProfileMembership.create({
        identityId,
        profileId: 'work',
        routineId: template.id,
        enabled: true,
      }),
      ProfileMembership.create({
        identityId,
        profileId: 'gaming',
        routineId: template.id,
        enabled: true,
      }),
    ];

    const result = await service.calculateEffectiveStatus(template);

    expect(result.isEffectivelyEnabled).toBe(true);
    expect(result.lifecycleSource).toBe('profile');
    expect(result.profileMemberships).toEqual([
      expect.objectContaining({ profileId: 'work', effectiveEnabled: false }),
      expect.objectContaining({ profileId: 'gaming', effectiveEnabled: true }),
    ]);
  });

  it('Profile ON never revives a disabled Routine', async () => {
    const template = createTemplate({ status: ReminderStatus.Paused });
    const identityId = String(template.identityId);
    profiles = [createProfile(identityId, { id: 'work', name: 'Work', active: true })];
    memberships = [
      ProfileMembership.create({
        identityId,
        profileId: 'work',
        routineId: template.id,
        enabled: true,
      }),
    ];

    const result = await service.calculateEffectiveStatus(template);

    expect(result.isEffectivelyEnabled).toBe(false);
    expect(result.lifecycleSource).toBe('routine');
    expect(result.statusReason).toContain('Profile 开启不能重新启用');
  });

  it('calculates a batch from one membership/profile load per identity', async () => {
    const identityId = IdentityId.generate();
    const enabled = createTemplate({ identityId });
    const paused = createTemplate({ identityId, status: ReminderStatus.Paused });
    const unprofiled = createTemplate({ identityId });
    profiles = [createProfile(String(identityId), { id: 'work', name: 'Work', active: true })];
    memberships = [
      ProfileMembership.create({
        identityId: String(identityId),
        profileId: 'work',
        routineId: enabled.id,
      }),
      ProfileMembership.create({
        identityId: String(identityId),
        profileId: 'work',
        routineId: paused.id,
      }),
    ];
    templateRepository.findByIdentityId.mockResolvedValue([enabled, paused, unprofiled]);

    const batch = await service.calculateEffectiveStatusBatch([enabled, paused, unprofiled]);
    const byIdentity = await service.getEffectivelyEnabledTemplatesByIdentityId(String(identityId));

    expect(batch).toHaveLength(3);
    expect(batch.find((item) => item.templateId === enabled.id)?.isEffectivelyEnabled).toBe(true);
    expect(batch.find((item) => item.templateId === paused.id)?.isEffectivelyEnabled).toBe(false);
    expect(byIdentity.map((item) => item.id)).toEqual([enabled.id, unprofiled.id]);
    expect(routineProfileStore.listMembershipsForRoutines).toHaveBeenCalled();
    expect(routineProfileStore.findProfilesByIds).toHaveBeenCalled();
  });
});
