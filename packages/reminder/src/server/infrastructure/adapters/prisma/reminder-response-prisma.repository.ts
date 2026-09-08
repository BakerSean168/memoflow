/**
 * ReminderResponsePrismaRepository - Prisma Implementation of IReminderResponseRepository
 * 提醒响应仓储 - Prisma 实现
 *
 * 实体：ReminderResponse（属于 ReminderTemplate 聚合上下文）
 */

import type {
  PrismaClient,
  ReminderResponse as PrismaReminderResponse,
  Prisma,
} from '@memoflow/database';
import type { IReminderResponseRepository } from '../../../domain/repositories/i-reminder-response-repository';
import type { ReminderResponseAction } from '@memoflow/contracts/reminder';
import { ReminderResponse } from '../../../domain/entities/reminder-response';
import { PrismaReminderResponseMapper } from './mappers/prisma-reminder-response-mapper';

export class ReminderResponsePrismaRepository implements IReminderResponseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Prisma record → ReminderResponse 实体
   */
  private mapToEntity(data: PrismaReminderResponse): ReminderResponse {
    return PrismaReminderResponseMapper.toDomain(data);
  }

  async save(response: ReminderResponse): Promise<void> {
    const dto = response.toServerDTO();

    await this.prisma.reminderResponse.upsert({
      where: { id: dto.id },
      create: {
        id: dto.id,
        templateId: dto.reminderTemplateId,
        identityId: dto.identityId,
        action: dto.action,
        responseTime: dto.responseTime ?? null,
        snoozeDurationSeconds: dto.snoozeDurationSeconds ?? null,
        timestamp: new Date(dto.timestamp),
      },
      update: {
        action: dto.action,
        responseTime: dto.responseTime ?? null,
        snoozeDurationSeconds: dto.snoozeDurationSeconds ?? null,
        timestamp: new Date(dto.timestamp),
      },
    });
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<ReminderResponse | null> {
    const data = await this.prisma.reminderResponse.findFirst({
      where: { id, identityId },
    });
    return data ? this.mapToEntity(data) : null;
  }

  async findByTemplateId(
    templateId: string,
    identityId: string,
    limit?: number,
  ): Promise<ReminderResponse[]> {
    const data = await this.prisma.reminderResponse.findMany({
      where: { templateId, identityId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return data.map((d: PrismaReminderResponse) => this.mapToEntity(d));
  }

  async getResponseStats(
    templateId: string,
    identityId: string,
    lookbackDays?: number,
  ): Promise<{
    total: number;
    clicked: number;
    ignored: number;
    snoozed: number;
    dismissed: number;
    completed: number;
    avgResponseTime: number;
  }> {
    const where: Prisma.ReminderResponseWhereInput = { templateId, identityId };
    if (lookbackDays) {
      const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      where.timestamp = { gte: cutoff };
    }

    const responses = await this.prisma.reminderResponse.findMany({
      where,
      select: {
        action: true,
        responseTime: true,
      },
    });

    const stats = {
      total: responses.length,
      clicked: 0,
      ignored: 0,
      snoozed: 0,
      dismissed: 0,
      completed: 0,
      avgResponseTime: 0,
    };

    let totalResponseTime = 0;
    let responseTimeCount = 0;

    for (const r of responses) {
      const action = r.action.toUpperCase() as ReminderResponseAction;
      switch (action) {
        case 'CLICKED':
          stats.clicked++;
          break;
        case 'IGNORED':
          stats.ignored++;
          break;
        case 'SNOOZED':
          stats.snoozed++;
          break;
        case 'DISMISSED':
          stats.dismissed++;
          break;
        case 'COMPLETED':
          stats.completed++;
          break;
      }

      if (r.responseTime != null) {
        totalResponseTime += r.responseTime;
        responseTimeCount++;
      }
    }

    stats.avgResponseTime =
      responseTimeCount > 0 ? Math.round(totalResponseTime / responseTimeCount) : 0;

    return stats;
  }

  async deleteByTemplateId(templateId: string, identityId: string): Promise<number> {
    const result = await this.prisma.reminderResponse.deleteMany({
      where: { templateId, identityId },
    });
    return result.count;
  }

  async getResponseDistribution(
    templateId: string,
    identityId: string,
    lookbackDays?: number,
  ): Promise<Record<ReminderResponseAction, number>> {
    const where: Prisma.ReminderResponseWhereInput = { templateId, identityId };
    if (lookbackDays) {
      const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      where.timestamp = { gte: cutoff };
    }

    const responses = await this.prisma.reminderResponse.groupBy({
      by: ['action'],
      where,
      _count: { action: true },
    });

    const distribution: Record<string, number> = {
      CLICKED: 0,
      IGNORED: 0,
      SNOOZED: 0,
      DISMISSED: 0,
      COMPLETED: 0,
    };

    for (const r of responses) {
      distribution[r.action.toUpperCase()] = r._count.action;
    }

    return distribution as Record<ReminderResponseAction, number>;
  }
}
