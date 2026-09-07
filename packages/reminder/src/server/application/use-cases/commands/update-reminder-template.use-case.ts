/** Update one Routine template and optionally replace its Profile memberships. */

import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { IReminderTemplateRepository } from '../../../domain/repositories/i-reminder-template-repository';
import type { IReminderGroupRepository } from '../../../domain/repositories/i-reminder-group-repository';
import type {
  ReminderTemplateClientDTO,
  UpdateReminderTemplateReq,
} from '@memoflow/contracts/reminder';
import { ReminderDomainService } from '../../../domain/services/index';
import { ReminderTemplateClientMapper } from '../../mappers/reminder-template-client.mapper';

export class UpdateReminderTemplateUseCase {
  private readonly reminderDomainService: ReminderDomainService;
  private readonly templateMapper: ReminderTemplateClientMapper;

  constructor(
    private readonly templateRepository: IReminderTemplateRepository,
    groupRepository: IReminderGroupRepository,
    reminderDomainService?: ReminderDomainService,
    templateMapper?: ReminderTemplateClientMapper,
  ) {
    this.reminderDomainService =
      reminderDomainService ?? new ReminderDomainService(templateRepository, groupRepository);
    this.templateMapper =
      templateMapper ?? new ReminderTemplateClientMapper(this.reminderDomainService);
  }

  async execute(
    id: string,
    request: UpdateReminderTemplateReq,
    cx: ExecutionContext,
  ): Promise<Result<ReminderTemplateClientDTO>> {
    const template = await this.templateRepository.findByIdForIdentity(cx.identityId, id);
    if (!template) {
      return error('NOT_FOUND', `Reminder Template ${id} not found`);
    }

    template.update({
      title: request.title,
      description: request.description,
      activeTime: request.activeTime,
      notificationConfig: request.notificationConfig
        ? {
            ...request.notificationConfig,
            actions: request.notificationConfig.actions ?? null,
          }
        : undefined,
      activeHours: request.activeHours
        ? {
            enabled: true,
            startHour: request.activeHours.startHour,
            endHour: request.activeHours.endHour,
          }
        : undefined,
      importanceLevel: request.importanceLevel,
      tags: request.tags,
      color: request.color,
      icon: request.icon,
    });

    try {
      if (request.profileIds !== undefined) {
        await this.reminderDomainService.replaceRoutineProfileMemberships(
          template,
          request.profileIds,
        );
      } else {
        await this.reminderDomainService.projectRoutineDefinition(template);
      }
    } catch (cause) {
      return error(
        cause instanceof TypeError ? 'BAD_REQUEST' : 'NOT_FOUND',
        cause instanceof Error ? cause.message : 'Failed to update Routine Profile memberships',
      );
    }

    await this.reminderDomainService.syncTemplateEffectiveEnabled(template);
    await this.templateRepository.save(template);
    return ok(await this.templateMapper.toDTO(template));
  }
}
