import type { ReminderTemplateClientDTO } from '@memoflow/contracts/reminder';
import type { ReminderTemplate } from '../../domain/aggregates/reminder-template';
import type { IReminderGroupRepository } from '../../domain/repositories/i-reminder-group-repository';
import type { ReminderGroup } from '../../domain/aggregates/reminder-group';
import { ReminderDomainService } from '../../domain/services/reminder-domain-service';
import type { ITemplateEffectiveStatus } from '../../domain/services';

/**
 * Maps reminder template aggregates to the enriched client DTO shape.
 * 将提醒模板聚合映射为带控制状态补充字段的客户端 DTO。
 */
export class ReminderTemplateClientMapper {
  constructor(
    private readonly reminderDomainService: ReminderDomainService,
    private readonly reminderGroupRepository: IReminderGroupRepository,
  ) {}

  async toDTO(template: ReminderTemplate): Promise<ReminderTemplateClientDTO> {
    const group = template.groupId
      ? await this.reminderGroupRepository.findByIdForIdentity(
          String(template.identityId),
          template.groupId,
        )
      : null;
    const effectiveStatus = await this.reminderDomainService
      .getControlService()
      .calculateEffectiveStatus(template, group);
    const dto = template.toClientDTO(true);

    dto.groupName = group?.name ?? null;
    dto.controlledByGroup = effectiveStatus.lifecycleSource === 'group';
    dto.lifecycleSource = effectiveStatus.lifecycleSource;
    dto.effectiveEnabled = effectiveStatus.isEffectivelyEnabled;
    dto.effectiveEnabledReason = effectiveStatus.statusReason;
    dto.groupEnabled = effectiveStatus.groupEnabled;
    dto.globalReminderEnabled = effectiveStatus.globalReminderEnabled;

    return dto;
  }

  async toDTOList(templates: ReminderTemplate[]): Promise<ReminderTemplateClientDTO[]> {
    const controlService = this.reminderDomainService.getControlService();
    const groupMap = new Map<string, ReminderGroup>();
    const groupIdsByIdentity = new Map<string, Set<string>>();
    for (const template of templates) {
      if (!template.groupId) continue;
      const identityId = String(template.identityId);
      const set = groupIdsByIdentity.get(identityId) ?? new Set<string>();
      set.add(template.groupId);
      groupIdsByIdentity.set(identityId, set);
    }
    for (const [identityId, groupIds] of groupIdsByIdentity) {
      const groups = await this.reminderGroupRepository.findByIds(identityId, Array.from(groupIds));
      for (const group of groups) {
        groupMap.set(group.id, group);
      }
    }
    const effectiveStatuses = await controlService.calculateEffectiveStatusBatch(templates);
    const statusMap = new Map<string, ITemplateEffectiveStatus>(
      effectiveStatuses.map((status) => [status.templateId, status]),
    );

    return templates.map((template) => {
      const dto = template.toClientDTO(true);
      const status = statusMap.get(template.id);
      const group = template.groupId ? (groupMap.get(template.groupId) ?? null) : null;

      dto.groupName = group?.name ?? null;
      dto.controlledByGroup = status?.lifecycleSource === 'group';
      dto.lifecycleSource = status?.lifecycleSource ?? 'template';
      dto.effectiveEnabled = status?.isEffectivelyEnabled ?? template.effectiveEnabled;
      dto.effectiveEnabledReason = status?.statusReason ?? '使用模板自身状态';
      dto.groupEnabled = status?.groupEnabled ?? null;
      dto.globalReminderEnabled = status?.globalReminderEnabled ?? true;

      return dto;
    });
  }
}
