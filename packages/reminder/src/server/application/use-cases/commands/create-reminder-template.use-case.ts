/** Create a Routine template with canonical ProfileMemberships. */

import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { IReminderTemplateRepository } from '../../../domain/repositories/i-reminder-template-repository';
import type { IReminderGroupRepository } from '../../../domain/repositories/i-reminder-group-repository';
import type { ReminderTemplate } from '../../../domain/aggregates/reminder-template';
import { ReminderDomainService } from '../../../domain/services/reminder-domain-service';
import type {
  ReminderTemplateClientDTO,
  CreateReminderTemplateReq,
} from '@memoflow/contracts/reminder';
import { ReminderTemplateClientMapper } from '../../mappers/reminder-template-client.mapper';

export class CreateReminderTemplateUseCase {
  private readonly reminderDomainService: ReminderDomainService;
  private readonly templateMapper: ReminderTemplateClientMapper;
  private readonly closureChecker: (identityId: string) => Promise<boolean>;

  constructor(
    private readonly templateRepository: IReminderTemplateRepository,
    groupRepository: IReminderGroupRepository,
    reminderDomainService?: ReminderDomainService,
    templateMapper?: ReminderTemplateClientMapper,
    closureChecker?: (identityId: string) => Promise<boolean>,
  ) {
    if (!closureChecker) {
      throw new Error('[FAIL-CLOSED] CreateReminderTemplateUseCase requires closureChecker');
    }
    this.closureChecker = closureChecker;
    this.reminderDomainService =
      reminderDomainService ?? new ReminderDomainService(templateRepository, groupRepository);
    this.templateMapper =
      templateMapper ?? new ReminderTemplateClientMapper(this.reminderDomainService);
  }

  private async replayExisting(
    existing: ReminderTemplate,
    profileIds: readonly string[],
  ): Promise<Result<ReminderTemplateClientDTO>> {
    try {
      await this.reminderDomainService.healRoutineProjection(existing, profileIds);
      return ok(await this.templateMapper.toDTO(existing));
    } catch (cause) {
      return error(
        cause instanceof TypeError ? 'BAD_REQUEST' : 'INTERNAL_ERROR',
        cause instanceof Error ? cause.message : 'Failed to repair Routine projection',
      );
    }
  }

  async execute(
    input: CreateReminderTemplateReq,
    cx: ExecutionContext,
  ): Promise<Result<ReminderTemplateClientDTO>> {
    const profileIds = input.profileIds ?? [];
    if (input.id) {
      const existing = await this.templateRepository.findByIdForIdentity(cx.identityId, input.id);
      if (existing) return this.replayExisting(existing, profileIds);
    }

    if (await this.closureChecker(cx.identityId)) {
      return error('FORBIDDEN', 'Account is closed or closure in progress');
    }

    const normalizedInput = {
      ...input,
      profileIds,
      activeTime: input.activeTime,
      activeHours: input.activeHours
        ? {
            enabled: true,
            startHour: input.activeHours.startHour,
            endHour: input.activeHours.endHour,
          }
        : undefined,
      notificationConfig: {
        ...input.notificationConfig,
        actions: input.notificationConfig.actions ?? null,
      },
      importanceLevel: input.importanceLevel,
    };

    try {
      const template = await this.reminderDomainService.createReminderTemplate({
        ...normalizedInput,
        id: input.id,
        identityId: cx.identityId,
      });
      return ok(await this.templateMapper.toDTO(template));
    } catch (cause) {
      if (input.id) {
        const existing = await this.templateRepository.findByIdForIdentity(cx.identityId, input.id);
        if (existing) return this.replayExisting(existing, profileIds);
      }

      return error(
        cause instanceof TypeError ? 'BAD_REQUEST' : 'NOT_FOUND',
        cause instanceof Error ? cause.message : 'Failed to create Routine',
      );
    }
  }
}
