/**
 * Update Reminder Template Service
 *
 * 更新提醒模板
 */

import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { IReminderTemplateRepository } from '../../../domain/repositories/i-reminder-template-repository';
import type { IReminderGroupRepository } from '../../../domain/repositories/i-reminder-group-repository';
import type {
  ReminderTemplateClientDTO,
  UpdateReminderTemplateReq,
} from '@memoflow/contracts/reminder';
import { ReminderDomainService, ReminderPolicy } from '../../../domain/services/index';
import { ReminderTemplateClientMapper } from '../../mappers/reminder-template-client.mapper';

/**
 * Update Reminder Template Service
 */
export class UpdateReminderTemplateUseCase {
  private readonly reminderDomainService: ReminderDomainService;
  private readonly templateMapper: ReminderTemplateClientMapper;

  constructor(
    private readonly templateRepository: IReminderTemplateRepository,
    private readonly groupRepository: IReminderGroupRepository,
    reminderDomainService?: ReminderDomainService,
    templateMapper?: ReminderTemplateClientMapper,
  ) {
    this.reminderDomainService =
      reminderDomainService ?? new ReminderDomainService(templateRepository, groupRepository);
    this.templateMapper =
      templateMapper ??
      new ReminderTemplateClientMapper(this.reminderDomainService, groupRepository);
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

    const policy = new ReminderPolicy();
    const previousGroupId = template.groupId;
    const group =
      request.groupId !== undefined && request.groupId !== null
        ? await this.groupRepository.findByIdForIdentity(cx.identityId, request.groupId)
        : null;

    if (request.groupId !== undefined && request.groupId !== null && !group) {
      return error('NOT_FOUND', `Invalid groupId: ${request.groupId}`);
    }

    if (request.groupId !== undefined) {
      policy.assertValidGroupAssignment(template, group);
    }

    // Use domain entity's update method
    template.update({
      title: request.title,
      description: request.description,
      // Residual 835: request activeTime is already ActiveTimeConfigDTO (activatedAt).
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
      groupId: request.groupId,
    });

    await this.reminderDomainService.syncTemplateEffectiveEnabled(template);
    await this.templateRepository.save(template);
    if (request.groupId !== undefined) {
      await this.reminderDomainService.replaceLegacyRoutineMembership(template, group);
    } else {
      await this.reminderDomainService.projectRoutineDefinition(template);
    }

    if (previousGroupId && previousGroupId !== template.groupId) {
      await this.reminderDomainService.updateGroupStats(cx.identityId, previousGroupId);
    }
    if (template.groupId) {
      await this.reminderDomainService.updateGroupStats(cx.identityId, template.groupId);
    }

    return ok(await this.templateMapper.toDTO(template));
  }
}
