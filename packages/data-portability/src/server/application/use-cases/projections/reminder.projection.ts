/**
 * Reminder Module — Export Projections
 */

import type { ExportContext } from '../../portable-runtime';
import type { PortableReminderGroup, PortableReminderTemplate, PortableReminderResponse, PortableUserReminderPreference } from '@memoflow/contracts/data-portability';
// Residual 1003: sole resolveExportRef/OrThrow (local dual retired).
import { parseJsonField, toBoolean, toDateString, toStringArray, resolveExportRef, resolveExportRefOrThrow } from './projection-helpers';

function responseTimeToPortable(value: unknown): string | null | undefined {
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  return toDateString(value) ?? null;
}

export function projectReminderGroups(groups: unknown[], ctx: ExportContext): PortableReminderGroup[] {
  return groups.map((g) => {
    const entity = g as Record<string, unknown>;
    const ref = ctx.refAllocator.allocate('reminderGroup');
    ctx.refToIdMap.set(entity.id as string, ref);
    return {
      _ref: ref,
      name: entity.name as string,
      description: entity.description as string | null | undefined,
      enabled: toBoolean(entity.enabled, true),
      status: entity.status as string,
      order: (entity.order as number) ?? 0,
      color: entity.color as string | null | undefined,
      icon: entity.icon as string | null | undefined,
      createdAt: toDateString(entity.createdAt),
      updatedAt: toDateString(entity.updatedAt),
    };
  });
}

export function projectReminderTemplates(templates: unknown[], ctx: ExportContext): PortableReminderTemplate[] {
  return templates.map((t) => {
    const entity = t as Record<string, unknown>;
    const ref = ctx.refAllocator.allocate('reminderTemplate');
    ctx.refToIdMap.set(entity.id as string, ref);
    return {
      _ref: ref,
      title: ((entity.title as string | undefined) ?? (entity.name as string | undefined)) ?? '',
      description: entity.description as string | null | undefined,
      type: entity.type as string,
      trigger: parseJsonField(entity.trigger, {}),
      activeTime: parseJsonField(entity.activeTime, {}),
      activeHours: parseJsonField(entity.activeHours),
      notificationConfig: parseJsonField(entity.notificationConfig, {}),
      selfEnabled: toBoolean(entity.selfEnabled, true),
      status: entity.status as string,
      groupRef: resolveExportRef(((entity.groupId as string | null | undefined) ?? (entity.reminderGroupId as string | null | undefined)) ?? null, ctx, 'reminder'),
      importanceLevel: entity.importanceLevel as string,
      tags: toStringArray(entity.tags),
      color: entity.color as string | null | undefined,
      icon: entity.icon as string | null | undefined,
      smartFrequencyEnabled: toBoolean(entity.smartFrequencyEnabled, false),
      createdAt: toDateString(entity.createdAt),
      updatedAt: toDateString(entity.updatedAt),
    };
  });
}

export function projectReminderResponses(responses: unknown[], ctx: ExportContext): PortableReminderResponse[] {
  return responses.map((r) => {
    const entity = r as Record<string, unknown>;
    const ref = ctx.refAllocator.allocate('reminderResponse');
    ctx.refToIdMap.set(entity.id as string, ref);
    return {
      _ref: ref,
      templateRef: resolveExportRefOrThrow(((entity.templateId as string | undefined) ?? (entity.reminderTemplateId as string | undefined)) as string, ctx, 'reminder'),
      action: entity.action as string,
      responseTime: responseTimeToPortable(entity.responseTime),
      timestamp: toDateString(entity.timestamp) ?? new Date().toISOString(),
    };
  });
}

export function projectUserReminderPreference(pref: unknown): PortableUserReminderPreference {
  const entity = pref as Record<string, unknown>;
  return {
    bestTimeSlots: (parseJsonField(entity.bestTimeSlots, []) as unknown[]) ?? [],
    worstTimeSlots: (parseJsonField(entity.worstTimeSlots, []) as unknown[]) ?? [],
    globalReminderEnabled: toBoolean(entity.globalReminderEnabled, true),
    globalSmartFrequency: toBoolean(entity.globalSmartFrequency, false),
  };
}

// Residual 1003: resolveExportRef/OrThrow elevated to projection-helpers.
