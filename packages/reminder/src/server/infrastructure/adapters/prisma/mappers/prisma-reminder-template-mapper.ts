/**
 * Prisma ReminderTemplate Mapper
 *
 * Maps between ReminderTemplate domain aggregate and Prisma model.
 * Handles aggregate root + child entity (ReminderHistory) conversion.
 */

import type {
  ReminderTemplate as PrismaReminderTemplate,
  ReminderHistory as PrismaReminderHistory,
} from '@memoflow/database';
import type {
  ReminderType,
  ReminderStatus,
  TriggerResult,
  NotificationChannel,
} from '@memoflow/contracts/reminder';
import type { ImportanceLevel } from '@memoflow/contracts/shared';
import { ReminderTemplate } from '../../../../domain/aggregates/reminder-template';
import { ReminderHistory } from '../../../../domain/entities/reminder-history';
import { ReminderTemplateId } from '../../../../domain/value-objects/reminder-template-id';
import { ReminderHistoryId } from '../../../../domain/value-objects/reminder-history-id';
import { IdentityId } from '@memoflow/domain-shared';
import {
  TriggerConfig,
  ActiveTimeConfig,
  NotificationConfig,
  ActiveHoursConfig,
  ResponseMetrics,
  FrequencyAdjustment,
} from '../../../../domain/value-objects';

/**
 * Prisma ReminderTemplate with optional history relation
 */
export type PrismaReminderTemplateWithHistory = PrismaReminderTemplate & {
  history?: PrismaReminderHistory[];
};

export class PrismaReminderTemplateMapper {
  /**
   * Prisma record → ReminderTemplate aggregate root (with optional history)
   */
  static toDomain(
    data: PrismaReminderTemplate,
    historyRecords?: PrismaReminderHistory[],
  ): ReminderTemplate {
    const trigger = TriggerConfig.fromDTO(JSON.parse(data.trigger));
    const activeTime = ActiveTimeConfig.fromDTO(JSON.parse(data.activeTime));
    const notificationConfig = NotificationConfig.fromDTO(JSON.parse(data.notificationConfig));
    const activeHours = data.activeHours
      ? ActiveHoursConfig.fromDTO(JSON.parse(data.activeHours))
      : null;
    const tags: string[] = JSON.parse(data.tags);

    // Smart Frequency: Reconstruct ResponseMetrics from flat fields
    const responseMetrics =
      data.clickRate !== null &&
      data.clickRate !== undefined &&
      data.ignoreRate !== null &&
      data.ignoreRate !== undefined
        ? ResponseMetrics.fromDTO({
            clickRate: data.clickRate,
            ignoreRate: data.ignoreRate,
            avgResponseTime: data.avgResponseTime ?? 0,
            snoozeCount: data.snoozeCount ?? 0,
            effectivenessScore: data.effectivenessScore ?? 0,
            sampleSize: data.sampleSize ?? 0,
            lastAnalysisTime: data.lastAnalysisTime?.getTime() ?? Date.now(),
          })
        : null;

    // Smart Frequency: Reconstruct FrequencyAdjustment from flat fields
    const frequencyAdjustment =
      data.originalInterval !== null &&
      data.originalInterval !== undefined &&
      data.adjustedInterval !== null &&
      data.adjustedInterval !== undefined
        ? FrequencyAdjustment.fromDTO({
            originalInterval: data.originalInterval,
            adjustedInterval: data.adjustedInterval,
            adjustmentReason: data.adjustmentReason ?? '',
            adjustmentTime: data.adjustmentTime?.getTime() ?? Date.now(),
            isAutoAdjusted: data.isAutoAdjusted ?? false,
            userConfirmed: data.userConfirmed ?? false,
            rejectionReason: null,
          })
        : null;

    // Build history child entities
    const history: ReminderHistory[] = [];
    if (historyRecords && historyRecords.length > 0) {
      for (const h of historyRecords) {
        history.push(PrismaReminderTemplateMapper.mapHistory(h));
      }
    }

    return ReminderTemplate.load({
      id: ReminderTemplateId.of(data.id),
      identityId: IdentityId.of(data.identityId),
      title: data.name,
      description: data.description ?? null,
      type: data.type as ReminderType,
      trigger,
      activeTime,
      activeHours,
      notificationConfig,
      selfEnabled: data.selfEnabled,
      status: data.status as ReminderStatus,
      effectiveEnabled: data.selfEnabled,
      importanceLevel: data.importanceLevel as ImportanceLevel,
      tags,
      color: data.color ?? null,
      icon: data.icon ?? null,
      nextTriggerAt: data.nextTriggerAt?.getTime() ?? null,
      responseMetrics,
      frequencyAdjustment,
      smartFrequencyEnabled: data.smartFrequencyEnabled ?? true,
      createdAt: data.createdAt instanceof Date ? data.createdAt.getTime() : Number(data.createdAt),
      updatedAt: data.updatedAt instanceof Date ? data.updatedAt.getTime() : Number(data.updatedAt),
      deletedAt: data.deletedAt == null ? null : data.deletedAt instanceof Date ? data.deletedAt.getTime() : Number(data.deletedAt),
      version: data.version ?? 1,
      history,
    });
  }

  /**
   * Map a single Prisma ReminderHistory row to domain entity
   */
  static mapHistory(h: PrismaReminderHistory): ReminderHistory {
    const notificationChannels = h.notificationChannel
      ? (JSON.parse(h.notificationChannel) as NotificationChannel[])
      : null;

    return ReminderHistory.load({
      id: ReminderHistoryId.of(h.id),
      templateId: h.templateId,
      identityId: h.identityId,
      triggeredAt: h.triggeredAt instanceof Date ? h.triggeredAt.getTime() : Number(h.triggeredAt),
      result: h.result as TriggerResult,
      error: h.error ?? null,
      notificationSent: h.notificationSent,
      notificationChannels,
      createdAt: h.createdAt instanceof Date ? h.createdAt.getTime() : Number(h.createdAt),
    });
  }

  /**
   * ReminderTemplate aggregate → Prisma write data
   */
  static toPersistence(template: ReminderTemplate) {
    const dto = template.toServerDTO();
    const responseMetrics = template.responseMetrics?.toDTO();
    const frequencyAdjustment = template.frequencyAdjustment?.toDTO();

    return {
      identityId: dto.identityId as string,
      name: dto.name,
      description: dto.description,
      type: dto.type,
      trigger: JSON.stringify(dto.trigger),
      activeTime: JSON.stringify(dto.activeTime),
      activeHours: dto.activeHours ? JSON.stringify(dto.activeHours) : null,
      notificationConfig: JSON.stringify(dto.notificationConfig),
      selfEnabled: dto.selfEnabled,
      status: dto.status,
      importanceLevel: dto.importanceLevel,
      tags: JSON.stringify(dto.tags),
      color: dto.color,
      icon: dto.icon,
      nextTriggerAt: dto.nextTriggerAt != null ? new Date(dto.nextTriggerAt) : null,
      stats: '{}',

      // Smart Frequency: Response Metrics
      clickRate: responseMetrics?.clickRate ?? null,
      ignoreRate: responseMetrics?.ignoreRate ?? null,
      avgResponseTime: responseMetrics?.avgResponseTime ?? null,
      snoozeCount: responseMetrics?.snoozeCount ?? 0,
      effectivenessScore: responseMetrics?.effectivenessScore ?? null,
      sampleSize: responseMetrics?.sampleSize ?? 0,
      lastAnalysisTime: responseMetrics?.lastAnalysisTime
        ? new Date(responseMetrics.lastAnalysisTime)
        : null,

      // Smart Frequency: Frequency Adjustment
      originalInterval: frequencyAdjustment?.originalInterval ?? null,
      adjustedInterval: frequencyAdjustment?.adjustedInterval ?? null,
      adjustmentReason: frequencyAdjustment?.adjustmentReason ?? null,
      adjustmentTime: frequencyAdjustment?.adjustmentTime
        ? new Date(frequencyAdjustment.adjustmentTime)
        : null,
      isAutoAdjusted: frequencyAdjustment?.isAutoAdjusted ?? false,
      userConfirmed: frequencyAdjustment?.userConfirmed ?? false,
      smartFrequencyEnabled: template.smartFrequencyEnabled ?? true,

      version: dto.version,
      deletedAt: dto.deletedAt != null ? new Date(dto.deletedAt) : null,
    };
  }
}
