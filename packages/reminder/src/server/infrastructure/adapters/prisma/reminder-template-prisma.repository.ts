/**
 * ReminderTemplatePrismaRepository - Prisma Implementation of IReminderTemplateRepository
 * 鎻愰啋妯℃澘浠撳偍 - Prisma 瀹炵幇
 *
 * 鑱氬悎鏍癸細ReminderTemplate
 * 瀛愬疄浣擄細ReminderHistory
 *
 * Extends AggregateRepositoryBase to automatically publish domain events after persistence.
 */

import type {
  PrismaClient,
  ReminderTemplate as PrismaReminderTemplate,
  ReminderHistory as PrismaReminderHistory,
  Prisma,
} from '@memoflow/database';
import type { IReminderTemplateRepository } from '../../../domain/repositories/i-reminder-template-repository';
import type { ReminderStatus } from '@memoflow/contracts/reminder';
import { ReminderTemplate } from '../../../domain/aggregates/reminder-template';
import {
  AggregateRepositoryBase,
  createEventBusAdapter,
  publishAggregateEvents,
} from '@memoflow/patterns';
import { eventBus } from '@memoflow/utils/domain';
import {
  PrismaReminderTemplateMapper,
  type PrismaReminderTemplateWithHistory,
} from './mappers/prisma-reminder-template-mapper';

const eventBusAdapter = createEventBusAdapter(eventBus);

export class ReminderTemplatePrismaRepository
  extends AggregateRepositoryBase<ReminderTemplate>
  implements IReminderTemplateRepository
{
  constructor(private readonly prisma: PrismaClient) {
    super(eventBusAdapter);
  }

  /**
   * Prisma record 鈫?ReminderTemplate 鑱氬悎鏍?
   */
  private mapToEntity(
    data: PrismaReminderTemplate,
    historyRecords?: PrismaReminderHistory[],
  ): ReminderTemplate {
    return PrismaReminderTemplateMapper.toDomain(data, historyRecords);
  }

  /**
   * ReminderTemplate 鑱氬悎鏍?鈫?Prisma write data
   */
  private toWriteData(template: ReminderTemplate) {
    return PrismaReminderTemplateMapper.toPersistence(template);
  }

  /**
   * Protected persistence method - called by base class before event publishing
   */
  protected async persist(template: ReminderTemplate): Promise<void> {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.saveWithinTransaction(tx, template);
    });
  }

  /**
   * Transaction-scoped aggregate persistence used by Reminder-owned durable
   * side-effect commits (NOTIF-3302). Event publication remains post-commit.
   */
  async saveWithinTransaction(
    tx: Prisma.TransactionClient,
    template: ReminderTemplate,
  ): Promise<void> {
    const writeData = this.toWriteData(template);

    // 1. Upsert 鑱氬悎鏍?
    await tx.reminderTemplate.upsert({
      where: { id: template.id as string },
      create: {
        id: template.id as string,
        ...writeData,
      },
      update: writeData,
    });

    // 2. 绾ц仈淇濆瓨瀛愬疄浣?- 鍘嗗彶璁板綍
    const historyList = template.getAllHistory();
    if (historyList.length > 0) {
      for (const history of historyList) {
        const hDto = history.toServerDTO();
        await tx.reminderHistory.upsert({
          where: { id: hDto.id },
          create: {
            id: hDto.id,
            templateId: hDto.templateId,
            identityId: String(template.identityId),
            triggeredAt: new Date(hDto.triggeredAt),
            result: hDto.result,
            error: hDto.error,
            notificationSent: hDto.notificationSent,
            notificationChannel: hDto.notificationChannels
              ? JSON.stringify(hDto.notificationChannels)
              : null,
          },
          update: {
            result: hDto.result,
            error: hDto.error,
            notificationSent: hDto.notificationSent,
            notificationChannel: hDto.notificationChannels
              ? JSON.stringify(hDto.notificationChannels)
              : null,
          },
        });
      }
    }
  }

  /** Publish aggregate events only after an externally-owned transaction commits. */
  async publishPersistedEvents(template: ReminderTemplate): Promise<void> {
    await publishAggregateEvents(template, {
      eventBus: this.eventBus,
      outboxWriter: this.outboxWriter,
    });
  }

  async findByIdForIdentity(
    identityId: string,
    id: string,
    options?: { includeHistory?: boolean; historyLimit?: number },
  ): Promise<ReminderTemplate | null> {
    const data = await this.prisma.reminderTemplate.findFirst({
      where: { id, identityId },
      include: options?.includeHistory
        ? { history: { orderBy: { triggeredAt: 'desc' }, take: options.historyLimit } }
        : undefined,
    });
    if (!data) return null;
    return this.mapToEntity(data, (data as PrismaReminderTemplateWithHistory).history);
  }

  async findByIdentityId(
    identityId: string,
    options?: { includeHistory?: boolean; historyLimit?: number; includeDeleted?: boolean },
  ): Promise<ReminderTemplate[]> {
    const where: Prisma.ReminderTemplateWhereInput = { identityId };
    if (!options?.includeDeleted) {
      where.deletedAt = null;
    }

    const data = await this.prisma.reminderTemplate.findMany({
      where,
      include: options?.includeHistory
        ? { history: { orderBy: { triggeredAt: 'desc' }, take: options.historyLimit } }
        : undefined,
      orderBy: { createdAt: 'asc' },
    });
    return data.map((d: PrismaReminderTemplateWithHistory) => this.mapToEntity(d, d.history));
  }

  async findAllTemplateRefs(): Promise<Array<{ id: string; identityId: string }>> {
    return this.prisma.reminderTemplate.findMany({
      where: { deletedAt: null },
      select: { id: true, identityId: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findActive(
    identityId: string,
    options?: { includeHistory?: boolean; historyLimit?: number },
  ): Promise<ReminderTemplate[]> {
    const where: Prisma.ReminderTemplateWhereInput = {
      identityId,
      selfEnabled: true,
      status: 'Active',
      deletedAt: null,
    };

    const data = await this.prisma.reminderTemplate.findMany({
      where,
      include: options?.includeHistory
        ? { history: { orderBy: { triggeredAt: 'desc' }, take: options.historyLimit } }
        : undefined,
      orderBy: { createdAt: 'asc' },
    });
    return data.map((d: PrismaReminderTemplateWithHistory) => this.mapToEntity(d, d.history));
  }

  async findByNextTriggerBefore(
    beforeTime: number,
    identityId?: string,
  ): Promise<ReminderTemplate[]> {
    const where: Prisma.ReminderTemplateWhereInput = {
      selfEnabled: true,
      status: 'Active',
      deletedAt: null,
      nextTriggerAt: { lte: new Date(beforeTime) },
    };
    if (identityId) {
      where.identityId = identityId;
    }

    const data = await this.prisma.reminderTemplate.findMany({
      where,
      orderBy: { nextTriggerAt: 'asc' },
    });
    return data.map((d: PrismaReminderTemplate) => this.mapToEntity(d));
  }

  async findByIds(
    identityId: string,
    ids: string[],
    options?: { includeHistory?: boolean; historyLimit?: number },
  ): Promise<ReminderTemplate[]> {
    if (ids.length === 0) return [];

    const data = await this.prisma.reminderTemplate.findMany({
      where: { id: { in: ids }, identityId },
      include: options?.includeHistory
        ? { history: { orderBy: { triggeredAt: 'desc' }, take: options.historyLimit } }
        : undefined,
    });
    return data.map((d: PrismaReminderTemplateWithHistory) => this.mapToEntity(d, d.history));
  }

  async delete(identityId: string, id: string): Promise<void> {
    // Cascade deletion: ReminderHistory is set to cascade in Prisma schema
    const result = await this.prisma.reminderTemplate.deleteMany({
      where: { id, identityId },
    });
    if (result.count !== 1) {
      throw new Error('Reminder template not found for the current identity.');
    }
  }

  async exists(identityId: string, id: string): Promise<boolean> {
    const count = await this.prisma.reminderTemplate.count({
      where: { id, identityId },
    });
    return count > 0;
  }

  async count(
    identityId: string,
    options?: { status?: ReminderStatus; includeDeleted?: boolean },
  ): Promise<number> {
    const where: Prisma.ReminderTemplateWhereInput = { identityId };
    if (options?.status) {
      where.status = options.status;
    }
    if (!options?.includeDeleted) {
      where.deletedAt = null;
    }

    return this.prisma.reminderTemplate.count({ where });
  }
}
