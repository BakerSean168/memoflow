import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  BatchGroupTemplatesReq,
  BatchGroupTemplatesRes,
  CreateReminderGroupReq,
  CreateReminderGroupRes,
  GroupStatsDTO,
  ReminderGroupListRes,
  UpdateReminderGroupReq,
} from '@memoflow/contracts/reminder';
import { ReminderGroup } from '../../domain/aggregates/reminder-group';
import { ReminderDomainService } from '../../domain/services/reminder-domain-service';
import type { IReminderGroupRepository } from '../../domain/repositories/i-reminder-group-repository';
import type { IReminderTemplateRepository } from '../../domain/repositories/i-reminder-template-repository';
import { GroupStats } from '../../domain/value-objects/group-stats';

export interface ReminderGroupApplicationServiceDependencies {
  readonly reminderGroupRepository: IReminderGroupRepository;
  readonly reminderTemplateRepository: IReminderTemplateRepository;
  readonly reminderDomainService: ReminderDomainService;
}

export class ReminderGroupApplicationService {
  private readonly reminderGroupRepository: IReminderGroupRepository;
  private readonly reminderTemplateRepository: IReminderTemplateRepository;
  private readonly reminderDomainService: ReminderDomainService;

  constructor(dependencies: ReminderGroupApplicationServiceDependencies) {
    this.reminderGroupRepository = dependencies.reminderGroupRepository;
    this.reminderTemplateRepository = dependencies.reminderTemplateRepository;
    this.reminderDomainService = dependencies.reminderDomainService;
  }

  private async getOwnedGroupOrFail(
    groupId: string,
    ctx: ExecutionContext,
  ): Promise<ReminderGroup | null> {
    return this.reminderGroupRepository.findByIdForIdentity(ctx.identityId, groupId);
  }

  async createGroup(
    data: CreateReminderGroupReq,
    ctx: ExecutionContext,
  ): Promise<Result<CreateReminderGroupRes>> {
    const group = await this.reminderDomainService.createReminderGroup({
      ...data,
      identityId: ctx.identityId,
    });
    return ok(group.toClientDTO());
  }

  async listGroups(ctx: ExecutionContext): Promise<Result<ReminderGroupListRes>> {
    const groups = await this.reminderGroupRepository.findByIdentityId(ctx.identityId);
    const data = groups.map((group) => group.toClientDTO());

    return ok({
      groups: data,
      total: data.length,
      page: 1,
      pageSize: data.length,
      hasMore: false,
    });
  }

  async getGroup(id: string, ctx: ExecutionContext): Promise<Result<CreateReminderGroupRes>> {
    const group = await this.getOwnedGroupOrFail(id, ctx);
    if (!group) {
      return fail({ code: 'NOT_FOUND', message: 'Group not found' });
    }

    return ok(group.toClientDTO());
  }

  async updateGroup(
    id: string,
    data: UpdateReminderGroupReq,
    ctx: ExecutionContext,
  ): Promise<Result<CreateReminderGroupRes>> {
    const existing = await this.getOwnedGroupOrFail(id, ctx);
    if (!existing) {
      return fail({ code: 'NOT_FOUND', message: 'Group not found' });
    }

    const updated = ReminderGroup.load({
      id: existing.id,
      identityId: existing.identityId,
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      enabled: existing.enabled,
      status: existing.status,
      order: data.order ?? existing.order,
      color: data.color ?? existing.color,
      icon: data.icon ?? existing.icon,
      stats: GroupStats.fromDTO(existing.stats as GroupStatsDTO),
      createdAt: existing.createdAt,
      updatedAt: new Date(),
      deletedAt: existing.deletedAt,
      version: existing.version,
    });

    await this.reminderGroupRepository.save(updated);
    await this.reminderDomainService.projectRoutineProfile(updated);
    await this.reminderDomainService.syncTemplatesEffectiveEnabledByProfile(ctx.identityId, id);

    return ok(updated.toClientDTO());
  }

  async deleteGroup(id: string, ctx: ExecutionContext): Promise<Result<undefined>> {
    const existing = await this.getOwnedGroupOrFail(id, ctx);
    if (!existing) {
      return fail({ code: 'NOT_FOUND', message: 'Group not found' });
    }

    await this.reminderDomainService.deleteGroup(ctx.identityId, id, false);
    return ok(undefined);
  }

  async batchGroupTemplates(
    groupId: string,
    data: BatchGroupTemplatesReq,
    ctx: ExecutionContext,
  ): Promise<Result<BatchGroupTemplatesRes>> {
    const group = await this.getOwnedGroupOrFail(groupId, ctx);
    if (!group) {
      return fail({ code: 'NOT_FOUND', message: 'Group not found' });
    }

    const successCount = await this.reminderDomainService.setProfileMembershipsEnabled(
      ctx.identityId,
      group.id,
      data.action === 'ENABLE',
    );

    return ok({ successCount, failedCount: 0 });
  }

  async toggleGroup(id: string, ctx: ExecutionContext): Promise<Result<CreateReminderGroupRes>> {
    const group = await this.getOwnedGroupOrFail(id, ctx);
    if (!group) {
      return fail({ code: 'NOT_FOUND', message: 'Group not found' });
    }

    const toggled = await this.reminderDomainService.toggleGroupAndTemplates(
      ctx.identityId,
      group.id,
    );
    return ok(toggled.toClientDTO());
  }
}
