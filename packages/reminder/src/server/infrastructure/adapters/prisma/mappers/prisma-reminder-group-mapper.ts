/**
 * Prisma ReminderGroup Mapper
 *
 * Maps between ReminderGroup domain aggregate and Prisma model.
 * Handles JSON serialization for stats field.
 */

import type { ReminderGroup as PrismaReminderGroup } from '@memoflow/database';
import type { ReminderStatus, GroupStatsDTO } from '@memoflow/contracts/reminder';
import { ReminderGroup } from '../../../../domain/aggregates/reminder-group';
import { GroupStats } from '../../../../domain/value-objects';
import type { IdentityId } from '@memoflow/domain-shared';

export class PrismaReminderGroupMapper {
  /**
   * Prisma record → ReminderGroup aggregate root
   */
  static toDomain(data: PrismaReminderGroup): ReminderGroup {
    const stats = data.stats
      ? GroupStats.fromDTO(JSON.parse(data.stats) as GroupStatsDTO)
      : GroupStats.createEmpty();

    return ReminderGroup.load({
      id: data.id,
      identityId: data.identityId as IdentityId,
      name: data.name,
      description: data.description ?? null,
      color: data.color ?? null,
      icon: data.icon ?? null,
      enabled: data.enabled,
      status: data.status as ReminderStatus,
      order: data.order,
      stats,
      version: data.version,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      deletedAt: data.deletedAt ?? null,
    });
  }

  /**
   * ReminderGroup aggregate → Prisma write data
   */
  static toPersistence(group: ReminderGroup) {
    const dto = group.toServerDTO();
    return {
      identityId: dto.identityId,
      name: dto.name,
      description: dto.description,
      color: dto.color,
      icon: dto.icon,
      enabled: dto.enabled,
      status: dto.status,
      order: dto.order,
      stats: JSON.stringify(dto.stats),
      version: dto.version,
      deletedAt: dto.deletedAt != null ? new Date(dto.deletedAt) : null,
    };
  }

  /**
   * Batch conversion: Prisma → Domain
   */
  static toDomainList(rows: PrismaReminderGroup[]): ReminderGroup[] {
    return rows.map((row) => PrismaReminderGroupMapper.toDomain(row));
  }
}
