import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  ReminderHistoryClientDTO,
  ReminderTemplateClientDTO,
} from '@memoflow/contracts/reminder';
import type { ReminderTemplate } from '../../domain/aggregates/reminder-template';
import type { IReminderTemplateRepository } from '../../domain/repositories/i-reminder-template-repository';
import { ReminderDomainService } from '../../domain/services/reminder-domain-service';
import { ReminderTemplateClientMapper } from '../mappers/reminder-template-client.mapper';

export interface ReminderTemplateActionApplicationServiceDependencies {
  readonly reminderTemplateRepository: IReminderTemplateRepository;
  readonly reminderDomainService: ReminderDomainService;
  readonly templateMapper: ReminderTemplateClientMapper;
}

export class ReminderTemplateActionApplicationService {
  private readonly reminderTemplateRepository: IReminderTemplateRepository;
  private readonly reminderDomainService: ReminderDomainService;
  private readonly templateMapper: ReminderTemplateClientMapper;

  constructor(dependencies: ReminderTemplateActionApplicationServiceDependencies) {
    this.reminderTemplateRepository = dependencies.reminderTemplateRepository;
    this.reminderDomainService = dependencies.reminderDomainService;
    this.templateMapper = dependencies.templateMapper;
  }

  private async getOwnedTemplateOrFail(
    templateId: string,
    ctx: ExecutionContext,
    options?: Parameters<IReminderTemplateRepository['findByIdForIdentity']>[2],
  ): Promise<ReminderTemplate | null> {
    return this.reminderTemplateRepository.findByIdForIdentity(ctx.identityId, templateId, options);
  }

  async enableTemplate(
    id: string,
    ctx: ExecutionContext,
  ): Promise<Result<ReminderTemplateClientDTO>> {
    const template = await this.getOwnedTemplateOrFail(id, ctx);
    if (!template) {
      return fail({ code: 'NOT_FOUND', message: 'Template not found' });
    }

    template.enable();
    await this.reminderDomainService.syncTemplateEffectiveEnabled(template);
    await this.reminderTemplateRepository.save(template);
    await this.reminderDomainService.projectRoutineDefinition(template);
    await this.reminderDomainService.updateProfileStatsForRoutine(ctx.identityId, template.id);

    return ok(await this.templateMapper.toDTO(template));
  }

  async pauseTemplate(
    id: string,
    ctx: ExecutionContext,
  ): Promise<Result<ReminderTemplateClientDTO>> {
    const template = await this.getOwnedTemplateOrFail(id, ctx);
    if (!template) {
      return fail({ code: 'NOT_FOUND', message: 'Template not found' });
    }

    template.pause();
    await this.reminderDomainService.syncTemplateEffectiveEnabled(template);
    await this.reminderTemplateRepository.save(template);
    await this.reminderDomainService.projectRoutineDefinition(template);
    await this.reminderDomainService.updateProfileStatsForRoutine(ctx.identityId, template.id);

    return ok(await this.templateMapper.toDTO(template));
  }

  async toggleTemplate(
    id: string,
    ctx: ExecutionContext,
  ): Promise<Result<ReminderTemplateClientDTO>> {
    const template = await this.getOwnedTemplateOrFail(id, ctx);
    if (!template) {
      return fail({ code: 'NOT_FOUND', message: 'Template not found' });
    }

    template.toggle();
    await this.reminderDomainService.syncTemplateEffectiveEnabled(template);
    await this.reminderTemplateRepository.save(template);
    await this.reminderDomainService.projectRoutineDefinition(template);
    await this.reminderDomainService.updateProfileStatsForRoutine(ctx.identityId, template.id);

    return ok(await this.templateMapper.toDTO(template));
  }

  async replaceTemplateProfiles(
    id: string,
    profileIds: readonly string[],
    ctx: ExecutionContext,
  ): Promise<Result<ReminderTemplateClientDTO>> {
    const template = await this.getOwnedTemplateOrFail(id, ctx);
    if (!template) {
      return fail({ code: 'NOT_FOUND', message: 'Template not found' });
    }

    try {
      await this.reminderDomainService.replaceRoutineProfileMemberships(template, profileIds);
    } catch (cause) {
      return fail({
        code: cause instanceof TypeError ? 'BAD_REQUEST' : 'NOT_FOUND',
        message:
          cause instanceof Error ? cause.message : 'Failed to replace Routine Profile memberships',
      });
    }

    await this.reminderDomainService.syncTemplateEffectiveEnabled(template);
    await this.reminderTemplateRepository.save(template);
    await this.reminderDomainService.updateProfileStatsForRoutine(ctx.identityId, template.id);
    return ok(await this.templateMapper.toDTO(template));
  }

  async getTemplateHistory(
    id: string,
    ctx: ExecutionContext,
  ): Promise<Result<ReminderHistoryClientDTO[]>> {
    const template = await this.getOwnedTemplateOrFail(id, ctx, { includeHistory: true });
    if (!template) {
      return fail({ code: 'NOT_FOUND', message: 'Template not found' });
    }

    const history = template.getAllHistory ? template.getAllHistory() : [];
    return ok(history.map((item) => item.toClientDTO()));
  }
}
