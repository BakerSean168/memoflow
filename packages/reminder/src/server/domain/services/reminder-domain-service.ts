import type {
  ActiveHoursConfigDTO,
  ActiveTimeConfigDTO,
  NotificationConfigDTO,
  TriggerConfigDTO,
} from '@memoflow/contracts/reminder';
import { ReminderType } from '@memoflow/contracts/reminder';
import type { IReminderGroupRepository, IReminderTemplateRepository } from '../repositories';
import { ReminderTemplate } from '../aggregates/reminder-template';
import { ReminderGroup } from '../aggregates/reminder-group';
import { ReminderTemplateControlService } from './reminder-template-control-service';
import { ReminderGroupBusinessService } from './reminder-group-business-service';
import { GroupStats, ReminderTemplateId } from '../value-objects';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import type { IUserReminderPreferenceRepository } from '../repositories/i-user-reminder-preference-repository';
import type { RoutineProfileStore } from '../ports';
import { LegacyRoutineCutoverService } from './legacy-routine-cutover-service';
import { ProfileMembership } from '../routine';

// Local branded type
type IdentityId = string & { readonly __brand: 'IdentityId' };

/**
 * Reminder Domain Service
 *
 * 核心职责：
 * - 编排和协调 Reminder 模块内的多个聚合根和实体。
 * - 处理跨聚合的复杂业务规则和不变量。
 * - 封装核心业务流程，供 Application Service 调用。
 *
 * 设计原则：
 * - 无状态：领域服务自身不持有状态，所有状态通过仓储加载和持久化。
 * - 依赖于抽象：依赖于仓储接口（IRepository），而不是具体实现。
 * - 业务逻辑的内聚中心：将分散在应用服务中的业务逻辑下沉到此。
 * - identity-scoped loads：聚合按 id 读取时必须携带 identityId。
 */
export class ReminderDomainService {
  private readonly controlService: ReminderTemplateControlService;
  private readonly groupBusinessService: ReminderGroupBusinessService;
  private readonly routineCutover: LegacyRoutineCutoverService | null;

  constructor(
    private readonly reminderTemplateRepository: IReminderTemplateRepository,
    private readonly reminderGroupRepository: IReminderGroupRepository,
    private readonly userReminderPreferenceRepository?: IUserReminderPreferenceRepository,
    private readonly routineProfileStore?: RoutineProfileStore,
  ) {
    this.controlService = new ReminderTemplateControlService(
      reminderTemplateRepository,
      userReminderPreferenceRepository,
      routineProfileStore,
    );
    this.groupBusinessService = new ReminderGroupBusinessService();
    this.routineCutover = routineProfileStore
      ? new LegacyRoutineCutoverService(routineProfileStore)
      : null;
  }

  /** Keep the canonical RoutineDefinition projection current during the cutover. */
  public async projectRoutineDefinition(template: ReminderTemplate): Promise<void> {
    await this.routineCutover?.projectTemplateDefinition(template);
  }

  /** Keep the canonical RoutineProfile projection current during the cutover. */
  public async projectRoutineProfile(group: ReminderGroup): Promise<void> {
    await this.routineCutover?.projectProfile(group);
  }

  private requireRoutineProfileStore(): RoutineProfileStore {
    if (!this.routineProfileStore) {
      throw new Error(
        '[FAIL-CLOSED] RoutineProfileStore is required for ProfileMembership commands',
      );
    }
    return this.routineProfileStore;
  }

  /** Replace the complete canonical ProfileMembership set for one Routine. */
  public async replaceRoutineProfileMemberships(
    template: ReminderTemplate,
    profileIds: readonly string[],
  ): Promise<void> {
    const store = this.routineProfileStore;
    if (!store) {
      if (profileIds.length === 0) return;
      throw new Error(
        '[FAIL-CLOSED] RoutineProfileStore is required for ProfileMembership commands',
      );
    }
    const identityId = String(template.identityId);
    const uniqueProfileIds = Array.from(new Set(profileIds));
    if (uniqueProfileIds.length !== profileIds.length) {
      throw new TypeError('Duplicate Routine profile membership');
    }

    const profiles = await store.findProfilesByIds({ identityId, profileIds: uniqueProfileIds });
    if (profiles.length !== uniqueProfileIds.length) {
      const found = new Set(profiles.map((profile) => profile.id));
      const missing = uniqueProfileIds.filter((profileId) => !found.has(profileId));
      throw new Error(`Routine Profile not found: ${missing.join(', ')}`);
    }

    const existing = await store.listMembershipsForRoutine({ identityId, routineId: template.id });
    const existingByProfile = new Map(
      existing.map((membership) => [membership.profileId, membership]),
    );
    const memberships = uniqueProfileIds.map(
      (profileId) =>
        existingByProfile.get(profileId) ??
        ProfileMembership.create({
          identityId,
          profileId,
          routineId: template.id,
          enabled: true,
          now: new Date(template.updatedAt),
        }),
    );

    await this.projectRoutineDefinition(template);
    await store.replaceRoutineMemberships({ identityId, routineId: template.id, memberships });
    template.markEligibilityContextChanged('profile-membership');
  }

  /** Repair deterministic create replay without overwriting a newer M:N set. */
  public async healRoutineProjection(
    template: ReminderTemplate,
    requestedProfileIds: readonly string[],
  ): Promise<void> {
    const store = this.routineProfileStore;
    if (!store) {
      if (requestedProfileIds.length === 0) return;
      throw new Error(
        '[FAIL-CLOSED] RoutineProfileStore is required for ProfileMembership commands',
      );
    }
    await this.projectRoutineDefinition(template);
    const memberships = await store.listMembershipsForRoutine({
      identityId: String(template.identityId),
      routineId: template.id,
    });
    if (memberships.length > 0 || requestedProfileIds.length === 0) return;
    await this.replaceRoutineProfileMemberships(template, requestedProfileIds);
  }

  /** Canonical membership lookup used by Profile operations and stats. */
  public async getTemplatesForProfile(
    identityId: string,
    profileId: string,
  ): Promise<ReminderTemplate[]> {
    const store = this.requireRoutineProfileStore();
    const memberships = await store.listMembershipsForProfile({ identityId, profileId });
    if (memberships.length === 0) return [];
    return this.reminderTemplateRepository.findByIds(
      identityId,
      memberships.map((membership) => membership.routineId),
    );
  }

  private async getGlobalReminderEnabled(identityId: string): Promise<boolean> {
    if (!this.userReminderPreferenceRepository) {
      return true;
    }

    const preferences = await this.userReminderPreferenceRepository.findByIdentityId(identityId);
    return preferences?.globalReminderEnabled ?? true;
  }

  public async syncTemplateEffectiveEnabled(template: ReminderTemplate): Promise<void> {
    const effectiveStatus = await this.controlService.calculateEffectiveStatus(template);
    template.setEffectiveEnabled(effectiveStatus.isEffectivelyEnabled);
  }

  public async syncTemplatesEffectiveEnabledByIdentity(identityId: string): Promise<void> {
    const templates = await this.reminderTemplateRepository.findByIdentityId(identityId);
    for (const template of templates) {
      await this.syncTemplateEffectiveEnabled(template);
      template.markEligibilityContextChanged('global-gate');
      await this.reminderTemplateRepository.save(template);
    }
  }

  public async syncTemplatesEffectiveEnabledByProfile(
    identityId: string,
    profileId: string,
  ): Promise<void> {
    const templates = await this.getTemplatesForProfile(identityId, profileId);
    for (const template of templates) {
      await this.syncTemplateEffectiveEnabled(template);
      template.markEligibilityContextChanged('profile-gate');
      await this.reminderTemplateRepository.save(template);
    }
  }

  /**
   * 获取模板控制服务（供应用层使用）
   */
  public getControlService(): ReminderTemplateControlService {
    return this.controlService;
  }

  // --- ReminderTemplate Methods ---

  public async createReminderTemplate(params: {
    id?: string;
    identityId: string;
    title: string;
    type: ReminderType;
    trigger: TriggerConfigDTO;
    activeTime: ActiveTimeConfigDTO;
    notificationConfig: NotificationConfigDTO;
    description?: string;
    activeHours?: ActiveHoursConfigDTO;
    importanceLevel?: ImportanceLevel;
    tags?: string[];
    color?: string;
    icon?: string;
    profileIds?: readonly string[];
  }): Promise<ReminderTemplate> {
    const template = ReminderTemplate.create({
      ...params,
      id: params.id ? ReminderTemplateId.of(params.id) : undefined,
      identityId: params.identityId as IdentityId,
    });
    await this.replaceRoutineProfileMemberships(template, params.profileIds ?? []);
    await this.syncTemplateEffectiveEnabled(template);
    await this.reminderTemplateRepository.save(template);
    return template;
  }

  public async getTemplate(
    identityId: string,
    id: string,
    options?: { includeHistory?: boolean },
  ): Promise<ReminderTemplate | null> {
    return this.reminderTemplateRepository.findByIdForIdentity(identityId, id, options);
  }

  public async deleteTemplate(
    identityId: string,
    id: string,
    softDelete: boolean = true,
  ): Promise<void> {
    const template = await this.getTemplate(identityId, id);
    if (!template) {
      throw new Error(`ReminderTemplate not found: ${id}`);
    }

    const profileIds = this.routineProfileStore
      ? (
          await this.routineProfileStore.listMembershipsForRoutine({
            identityId,
            routineId: id,
          })
        ).map((membership) => membership.profileId)
      : [];

    if (softDelete) {
      template.softDelete();
      await this.reminderTemplateRepository.save(template);
    } else {
      await this.reminderTemplateRepository.delete(identityId, id);
    }
    await this.routineCutover?.deleteRoutine({ identityId, routineId: id });

    for (const profileId of new Set(profileIds)) {
      await this.updateGroupStats(identityId, profileId);
    }
  }

  // --- ReminderGroup Methods ---

  public async createReminderGroup(params: {
    identityId: string;
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    order?: number;
  }): Promise<ReminderGroup> {
    const existingGroup = await this.reminderGroupRepository.findByName(
      params.identityId,
      params.name,
    );
    if (existingGroup) {
      throw new Error(`ReminderGroup with name "${params.name}" already exists.`);
    }

    const group = ReminderGroup.create({ ...params, identityId: params.identityId });
    await this.reminderGroupRepository.save(group);
    await this.projectRoutineProfile(group);
    return group;
  }

  public async getGroup(identityId: string, id: string): Promise<ReminderGroup | null> {
    return this.reminderGroupRepository.findByIdForIdentity(identityId, id);
  }

  public async deleteGroup(
    identityId: string,
    id: string,
    softDelete: boolean = true,
  ): Promise<void> {
    const group = await this.getGroup(identityId, id);
    if (!group) {
      throw new Error(`ReminderGroup not found: ${id}`);
    }

    // Business Rule: cannot delete a Profile that still owns memberships.
    const templatesInProfile = await this.getTemplatesForProfile(identityId, id);
    if (templatesInProfile.length > 0) {
      throw new Error(
        `Cannot delete Profile ${id} because it still contains ${templatesInProfile.length} Routine memberships.`,
      );
    }

    if (softDelete) {
      group.softDelete();
      await this.reminderGroupRepository.save(group);
    } else {
      await this.reminderGroupRepository.delete(identityId, id);
    }
    await this.routineCutover?.deleteProfile({ identityId, profileId: id });
  }

  // --- Cross-Aggregate Methods ---

  public async toggleGroupAndTemplates(identityId: string, id: string): Promise<ReminderGroup> {
    const group = await this.getGroup(identityId, id);
    if (!group) {
      throw new Error(`ReminderGroup not found: ${id}`);
    }

    group.toggle();
    await this.reminderGroupRepository.save(group);
    await this.projectRoutineProfile(group);
    await this.syncTemplatesEffectiveEnabledByProfile(identityId, id);
    return group;
  }

  /** Toggle only membership-local enablement for all Routines in one Profile. */
  public async setProfileMembershipsEnabled(
    identityId: string,
    profileId: string,
    enabled: boolean,
  ): Promise<number> {
    const store = this.requireRoutineProfileStore();
    const memberships = await store.listMembershipsForProfile({ identityId, profileId });
    for (const membership of memberships) {
      if (enabled) membership.enable();
      else membership.disable();
      await store.upsertMembership(membership);
    }

    const templates = await this.reminderTemplateRepository.findByIds(
      identityId,
      memberships.map((membership) => membership.routineId),
    );
    for (const template of templates) {
      await this.syncTemplateEffectiveEnabled(template);
      template.markEligibilityContextChanged('profile-membership-state');
      await this.reminderTemplateRepository.save(template);
    }
    await this.updateGroupStats(identityId, profileId);
    return memberships.length;
  }

  public async updateGroupStats(identityId: string, profileId: string): Promise<void> {
    const group = await this.getGroup(identityId, profileId);
    if (!group) return;
    const templates = await this.getTemplatesForProfile(identityId, profileId);

    const stats = this.groupBusinessService.calculateGroupStatistics(templates);
    group.updateStats(
      GroupStats.create({
        totalTemplates: stats.totalTemplates,
        activeTemplates: stats.activeTemplates,
        pausedTemplates: stats.pausedTemplates,
        selfEnabledTemplates: templates.filter((template) => template.selfEnabled).length,
        selfPausedTemplates: templates.filter((template) => !template.selfEnabled).length,
      }),
    );
    await this.reminderGroupRepository.save(group);
  }

  public async updateProfileStatsForRoutine(identityId: string, routineId: string): Promise<void> {
    if (!this.routineProfileStore) return;
    const memberships = await this.routineProfileStore.listMembershipsForRoutine({
      identityId,
      routineId,
    });
    for (const profileId of new Set(memberships.map((membership) => membership.profileId))) {
      await this.updateGroupStats(identityId, profileId);
    }
  }
}
