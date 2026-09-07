/**
 * Legacy Reminder effective-state facade.
 *
 * ROUTINE-2301 delegates effective-state truth to the canonical Routine Coach
 * AND-gate; the retired control-mode dimension is no longer transported or persisted.
 */
import { ReminderStatus } from '@memoflow/contracts/reminder';
import type { ReminderGroup } from '../aggregates/reminder-group';
import type { ReminderTemplate } from '../aggregates/reminder-template';
import type { IReminderGroupRepository } from '../repositories/i-reminder-group-repository';
import type { IReminderTemplateRepository } from '../repositories/i-reminder-template-repository';
import type { IUserReminderPreferenceRepository } from '../repositories/i-user-reminder-preference-repository';
import { evaluateLegacyReminderEffectiveEnabled } from '../routine';

export interface ITemplateEffectiveStatus {
  templateId: string;
  templateStatus: ReminderStatus;
  groupId: string | null;
  groupStatus: ReminderStatus | null;
  effectiveStatus: ReminderStatus;
  isEffectivelyEnabled: boolean;
  statusReason: string;
  lifecycleSource: 'global' | 'group' | 'template';
  globalReminderEnabled: boolean;
  groupEnabled: boolean | null;
}

export class ReminderTemplateControlService {
  constructor(
    private readonly templateRepository: IReminderTemplateRepository,
    private readonly groupRepository: IReminderGroupRepository,
    private readonly preferenceRepository?: IUserReminderPreferenceRepository,
  ) {}

  private async getGlobalReminderEnabled(identityId: string): Promise<boolean> {
    if (!this.preferenceRepository) return true;
    const preferences = await this.preferenceRepository.findByIdentityId(identityId);
    return preferences?.globalReminderEnabled ?? true;
  }

  async calculateEffectiveStatus(
    template: ReminderTemplate,
    group?: ReminderGroup | null,
  ): Promise<ITemplateEffectiveStatus> {
    const globalReminderEnabled = await this.getGlobalReminderEnabled(String(template.identityId));
    let targetGroup = group ?? null;
    if (template.groupId && !targetGroup) {
      targetGroup = await this.groupRepository.findByIdForIdentity(
        String(template.identityId),
        template.groupId,
      );
    }
    return this.buildEffectiveStatus(template, targetGroup, globalReminderEnabled);
  }

  async calculateEffectiveStatusBatch(
    templates: ReminderTemplate[],
  ): Promise<ITemplateEffectiveStatus[]> {
    const globalByIdentity = new Map<string, boolean>();
    const groupIdsByIdentity = new Map<string, Set<string>>();

    for (const template of templates) {
      const identityId = String(template.identityId);
      if (!globalByIdentity.has(identityId)) {
        globalByIdentity.set(identityId, await this.getGlobalReminderEnabled(identityId));
      }
      if (template.groupId) {
        const ids = groupIdsByIdentity.get(identityId) ?? new Set<string>();
        ids.add(template.groupId);
        groupIdsByIdentity.set(identityId, ids);
      }
    }

    const groups = new Map<string, ReminderGroup>();
    for (const [identityId, groupIds] of groupIdsByIdentity) {
      for (const group of await this.groupRepository.findByIds(identityId, Array.from(groupIds))) {
        groups.set(`${identityId}:${group.id}`, group);
      }
    }

    return templates.map((template) => {
      const identityId = String(template.identityId);
      const group = template.groupId
        ? groups.get(`${identityId}:${template.groupId}`) ?? null
        : null;
      return this.buildEffectiveStatus(
        template,
        group,
        globalByIdentity.get(identityId) ?? true,
      );
    });
  }

  async isTemplateEffectivelyEnabled(template: ReminderTemplate): Promise<boolean> {
    return (await this.calculateEffectiveStatus(template)).isEffectivelyEnabled;
  }

  async getEffectivelyEnabledTemplatesInGroup(
    identityId: string,
    groupId: string,
  ): Promise<ReminderTemplate[]> {
    if (!(await this.groupRepository.findByIdForIdentity(identityId, groupId))) return [];
    const templates = await this.templateRepository.findByGroupId(groupId, identityId);
    const statusResults = await this.calculateEffectiveStatusBatch(templates);
    const enabledIds = new Set(
      statusResults.filter((result) => result.isEffectivelyEnabled).map((result) => result.templateId),
    );
    return templates.filter((template) => enabledIds.has(template.id));
  }

  async getEffectivelyEnabledTemplatesByIdentityId(identityId: string): Promise<ReminderTemplate[]> {
    const templates = await this.templateRepository.findByIdentityId(identityId);
    const statusResults = await this.calculateEffectiveStatusBatch(templates);
    const enabledIds = new Set(
      statusResults.filter((result) => result.isEffectivelyEnabled).map((result) => result.templateId),
    );
    return templates.filter((template) => enabledIds.has(template.id));
  }

  private buildEffectiveStatus(
    template: ReminderTemplate,
    group: ReminderGroup | null,
    globalReminderEnabled: boolean,
  ): ITemplateEffectiveStatus {
    const evaluation = evaluateLegacyReminderEffectiveEnabled({
      template,
      group,
      globalReminderEnabled,
    });
    const groupId = template.groupId ?? null;
    const hasPersistedGroup = Boolean(groupId && group);
    let statusReason: string;
    let lifecycleSource: ITemplateEffectiveStatus['lifecycleSource'];

    if (!globalReminderEnabled) {
      statusReason = '全局提醒总开关已关闭（legacy seam -> Routine gate）';
      lifecycleSource = 'global';
    } else if (!groupId) {
      statusReason = '未分组，使用 Routine 自身 enabled 状态';
      lifecycleSource = 'template';
    } else if (!group) {
      statusReason = '分组不存在，按无 Profile 的 Routine 状态计算';
      lifecycleSource = 'template';
    } else if (!group.enabled || group.status !== ReminderStatus.Active) {
      statusReason = 'Profile 已关闭或未激活；成员 enabled 状态保持不变';
      lifecycleSource = 'group';
    } else if (!template.selfEnabled || template.status !== ReminderStatus.Active) {
      statusReason = 'Routine 自身已关闭；Profile 开启不能重新启用它';
      lifecycleSource = 'template';
    } else {
      statusReason = 'Routine × Profile × Membership × TemporaryOverride 全部允许';
      lifecycleSource = 'group';
    }

    return {
      templateId: template.id,
      templateStatus: template.status,
      groupId,
      groupStatus: hasPersistedGroup ? group!.status : null,
      effectiveStatus: evaluation.effectiveEnabled ? ReminderStatus.Active : ReminderStatus.Paused,
      isEffectivelyEnabled: evaluation.effectiveEnabled,
      statusReason,
      lifecycleSource,
      globalReminderEnabled,
      groupEnabled: hasPersistedGroup ? group!.enabled : null,
    };
  }
}
