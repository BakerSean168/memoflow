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
    routineProfileStore?: RoutineProfileStore,
  ) {
    this.controlService = new ReminderTemplateControlService(
      reminderTemplateRepository,
      reminderGroupRepository,
      userReminderPreferenceRepository,
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

  /** Repair deterministic legacy replay without collapsing an existing M:N membership set. */
  public async healLegacyRoutineProjection(
    template: ReminderTemplate,
    group: ReminderGroup | null,
  ): Promise<void> {
    await this.routineCutover?.healLegacyProjection({ template, group });
  }

  /** Legacy single-group commands temporarily map to a complete membership replace. */
  public async replaceLegacyRoutineMembership(
    template: ReminderTemplate,
    group: ReminderGroup | null,
  ): Promise<void> {
    await this.routineCutover?.replaceLegacySingleMembership({ template, group });
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
      await this.reminderTemplateRepository.save(template);
    }
  }

  public async syncTemplatesEffectiveEnabledByGroup(
    identityId: string,
    groupId: string,
  ): Promise<void> {
    const group = await this.getGroup(identityId, groupId);
    if (!group) return;
    const templates = await this.reminderTemplateRepository.findByGroupId(groupId, identityId);
    for (const template of templates) {
      await this.syncTemplateEffectiveEnabled(template);
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
    groupId?: string;
  }): Promise<ReminderTemplate> {
    const targetGroup = params.groupId
      ? await this.reminderGroupRepository.findByIdForIdentity(params.identityId, params.groupId)
      : null;
    if (params.groupId && !targetGroup) {
      throw new Error(`Invalid groupId: ${params.groupId}`);
    }

    const template = ReminderTemplate.create({
      ...params,
      id: params.id ? ReminderTemplateId.of(params.id) : undefined,
      identityId: params.identityId as IdentityId,
    });
    await this.syncTemplateEffectiveEnabled(template);
    await this.reminderTemplateRepository.save(template);
    await this.replaceLegacyRoutineMembership(template, targetGroup);

    if (params.groupId) {
      await this.updateGroupStats(params.identityId, params.groupId);
    }

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

    const groupId = template.groupId;

    if (softDelete) {
      template.softDelete();
      await this.reminderTemplateRepository.save(template);
    } else {
      await this.reminderTemplateRepository.delete(identityId, id);
    }
    await this.routineCutover?.deleteRoutine({ identityId, routineId: id });

    if (groupId) {
      await this.updateGroupStats(identityId, groupId);
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

    // Business Rule: Cannot delete a group that still contains templates.
    const templatesInGroup = await this.reminderTemplateRepository.findByGroupId(id, identityId);
    if (templatesInGroup.length > 0) {
      throw new Error(
        `Cannot delete group ${id} because it still contains ${templatesInGroup.length} templates.`,
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

  public async assignTemplateToGroup(
    identityId: string,
    templateId: string,
    groupId: string | null,
  ): Promise<ReminderTemplate> {
    const template = await this.getTemplate(identityId, templateId);
    if (!template) {
      throw new Error(`ReminderTemplate not found: ${templateId}`);
    }

    const oldGroupId = template.groupId;

    const targetGroup = groupId ? await this.getGroup(identityId, groupId) : null;
    if (groupId && !targetGroup) {
      throw new Error(`Invalid groupId: ${groupId}`);
    }

    template.moveToGroup(groupId);
    await this.syncTemplateEffectiveEnabled(template);
    await this.reminderTemplateRepository.save(template);
    await this.replaceLegacyRoutineMembership(template, targetGroup);

    if (oldGroupId) {
      await this.updateGroupStats(identityId, oldGroupId);
    }
    if (groupId) {
      await this.updateGroupStats(identityId, groupId);
    }

    return template;
  }

  public async toggleGroupAndTemplates(identityId: string, id: string): Promise<ReminderGroup> {
    const group = await this.getGroup(identityId, id);
    if (!group) {
      throw new Error(`ReminderGroup not found: ${id}`);
    }

    group.toggle();
    await this.reminderGroupRepository.save(group);
    await this.projectRoutineProfile(group);
    await this.syncTemplatesEffectiveEnabledByGroup(identityId, id);
    return group;
  }

  public async updateGroupStats(identityId: string, groupId: string): Promise<void> {
    const group = await this.getGroup(identityId, groupId);
    if (!group) return;
    const templates = await this.reminderTemplateRepository.findByGroupId(groupId, identityId, {
      includeDeleted: false,
    });

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
}
