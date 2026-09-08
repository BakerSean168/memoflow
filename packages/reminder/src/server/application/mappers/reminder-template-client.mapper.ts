import type { ReminderTemplateClientDTO } from '@memoflow/contracts/reminder';
import type { ReminderTemplate } from '../../domain/aggregates/reminder-template';
import { ReminderDomainService } from '../../domain/services/reminder-domain-service';
import type { ITemplateEffectiveStatus } from '../../domain/services';

/**
 * Maps ReminderTemplate aggregates to the canonical Routine/Profile read model.
 * ProfileMembership enrichment is loaded by the control service from the
 * canonical RoutineProfileStore; legacy groupId is never exposed here.
 */
export class ReminderTemplateClientMapper {
  constructor(private readonly reminderDomainService: ReminderDomainService) {}

  async toDTO(template: ReminderTemplate): Promise<ReminderTemplateClientDTO> {
    const effectiveStatus = await this.reminderDomainService
      .getControlService()
      .calculateEffectiveStatus(template);
    return this.applyEffectiveStatus(template.toClientDTO(true), effectiveStatus);
  }

  async toDTOList(templates: ReminderTemplate[]): Promise<ReminderTemplateClientDTO[]> {
    const statuses = await this.reminderDomainService
      .getControlService()
      .calculateEffectiveStatusBatch(templates);
    const statusById = new Map<string, ITemplateEffectiveStatus>(
      statuses.map((status) => [status.templateId, status]),
    );

    return templates.map((template) => {
      const dto = template.toClientDTO(true);
      const status = statusById.get(template.id);
      return status ? this.applyEffectiveStatus(dto, status) : dto;
    });
  }

  private applyEffectiveStatus(
    dto: ReminderTemplateClientDTO,
    status: ITemplateEffectiveStatus,
  ): ReminderTemplateClientDTO {
    dto.profileMemberships = status.profileMemberships.map((membership) => ({ ...membership }));
    dto.lifecycleSource = status.lifecycleSource;
    dto.effectiveEnabled = status.isEffectivelyEnabled;
    dto.effectiveEnabledReason = status.statusReason;
    dto.globalReminderEnabled = status.globalReminderEnabled;
    return dto;
  }
}
