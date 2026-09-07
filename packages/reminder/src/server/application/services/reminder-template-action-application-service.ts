import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  ReminderHistoryClientDTO,
  ReminderTemplateClientDTO,
} from '@memoflow/contracts/reminder';
import type { ReminderTemplate } from '../../domain/aggregates/reminder-template';
import type { ReminderGroup } from '../../domain/aggregates/reminder-group';
import type { IReminderGroupRepository } from '../../domain/repositories/i-reminder-group-repository';
import type { IReminderTemplateRepository } from '../../domain/repositories/i-reminder-template-repository';
import { ReminderDomainService } from '../../domain/services/reminder-domain-service';
import { ReminderTemplateClientMapper } from '../mappers/reminder-template-client.mapper';

export interface ReminderTemplateActionApplicationServiceDependencies {
  readonly reminderTemplateRepository: IReminderTemplateRepository;
  readonly reminderGroupRepository: IReminderGroupRepository;
  readonly reminderDomainService: ReminderDomainService;
  readonly templateMapper: ReminderTemplateClientMapper;
}

export class ReminderTemplateActionApplicationService {
  private readonly reminderTemplateRepository: IReminderTemplateRepository;
  private readonly reminderGroupRepository: IReminderGroupRepository;
  private readonly reminderDomainService: ReminderDomainService;
  private readonly templateMapper: ReminderTemplateClientMapper;

  constructor(dependencies: ReminderTemplateActionApplicationServiceDependencies) {
    this.reminderTemplateRepository = dependencies.reminderTemplateRepository;
    this.reminderGroupRepository = dependencies.reminderGroupRepository;
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

  private async getOwnedGroupOrFail(
    groupId: string,
    ctx: ExecutionContext,
  ): Promise<ReminderGroup | null> {
    return this.reminderGroupRepository.findByIdForIdentity(ctx.identityId, groupId);
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
    if (template.groupId) {
      await this.reminderDomainService.updateGroupStats(ctx.identityId, template.groupId);
    }

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
    if (template.groupId) {
      await this.reminderDomainService.updateGroupStats(ctx.identityId, template.groupId);
    }

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
    if (template.groupId) {
      await this.reminderDomainService.updateGroupStats(ctx.identityId, template.groupId);
    }

    return ok(await this.templateMapper.toDTO(template));
  }

  async moveTemplate(
    id: string,
    groupId: string | null,
    ctx: ExecutionContext,
  ): Promise<Result<ReminderTemplateClientDTO>> {
    const template = await this.getOwnedTemplateOrFail(id, ctx);
    if (!template) {
      return fail({ code: 'NOT_FOUND', message: 'Template not found' });
    }

    if (groupId !== null) {
      const group = await this.getOwnedGroupOrFail(groupId, ctx);
      if (!group) {
        return fail({ code: 'NOT_FOUND', message: 'Group not found' });
      }
    }

    const result = await this.reminderDomainService.assignTemplateToGroup(
      ctx.identityId,
      id,
      groupId,
    );
    return ok(await this.templateMapper.toDTO(result));
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
