/**
 * Schedule Module — Export Projections
 */

import type { ExportContext } from '../../portable-runtime';
import type { PortableSchedule, PortableScheduleTask } from '@memoflow/contracts/data-portability';
import { parseJsonField, toBoolean, toDateString, toStringArray } from './projection-helpers';

export function projectCalendarEntries(entries: unknown[], ctx: ExportContext): PortableSchedule[] {
  return entries.map((e) => {
    const entity = e as Record<string, unknown>;
    const ref = ctx.refAllocator.allocate('calendarEntry');
    ctx.refToIdMap.set(entity.id as string, ref);
    if (entity.rangeKind !== 'Timed') {
      throw new Error(
        `Portable Schedule V3 cannot represent ${String(entity.rangeKind)} CalendarEntry '${String(entity.id)}' without losing Ymd semantics`,
      );
    }
    const startTime = toDateString(entity.timedStart);
    const endTime = toDateString(entity.timedEnd);
    if (startTime == null || endTime == null) {
      throw new Error(
        `Timed CalendarEntry '${String(entity.id)}' is missing canonical timed range columns`,
      );
    }
    const startMs = Date.parse(startTime);
    const endMs = Date.parse(endTime);
    return {
      _ref: ref,
      title: entity.title as string,
      description: entity.description as string | null | undefined,
      startTime,
      endTime,
      duration: Math.max(0, Math.round((endMs - startMs) / 60000)),
      location: entity.location as string | null | undefined,
      attendees: entity.attendees == null ? undefined : toStringArray(entity.attendees),
      createdAt: toDateString(entity.createdAt),
      updatedAt: toDateString(entity.updatedAt),
    };
  });
}

export function projectScheduleTasks(tasks: unknown[], ctx: ExportContext): PortableScheduleTask[] {
  return tasks.map((t) => {
    const entity = t as Record<string, unknown>;
    const ref = ctx.refAllocator.allocate('scheduleTask');
    ctx.refToIdMap.set(entity.id as string, ref);
    const sourceId = entity.sourceEntityId as string | undefined;
    const sourceRef = sourceId ? (ctx.refToIdMap.get(sourceId) ?? null) : null;
    if (sourceId && !sourceRef) {
      ctx.warnings.push(
        `ScheduleTask "${entity.name}" references source entity "${sourceId}" not in export — exported as detached`,
      );
    }

    return {
      _ref: ref,
      name: entity.name as string,
      description: entity.description as string | null | undefined,
      sourceModule: entity.sourceModule as string,
      sourceRef,
      status: entity.status as string,
      enabled: toBoolean(entity.enabled, true),
      schedule: parseJsonField(entity.schedule) ?? {
        cronExpression: entity.cronExpression ?? null,
        timezone: entity.timezone ?? null,
        startDate: toDateString(entity.startDate) ?? null,
        endDate: toDateString(entity.endDate) ?? null,
      },
      execution: parseJsonField(entity.execution) ?? {
        maxExecutions: entity.maxExecutions ?? null,
        nextRunAt: toDateString(entity.nextRunAt) ?? null,
        lastRunAt: toDateString(entity.lastRunAt) ?? null,
        executionCount: entity.executionCount ?? 0,
        lastExecutionStatus: entity.lastExecutionStatus ?? null,
        lastExecutionDuration: entity.lastExecutionDuration ?? null,
        consecutiveFailures: entity.consecutiveFailures ?? 0,
      },
      retryPolicy: parseJsonField(entity.retryPolicy) ?? {
        maxRetries: entity.maxRetries ?? 3,
        initialDelayMs: entity.initialDelayMs ?? 1000,
        maxDelayMs: entity.maxDelayMs ?? 30000,
        backoffMultiplier: entity.backoffMultiplier ?? 2,
        retryableStatuses: parseJsonField(entity.retryableStatuses, []),
        timeout: entity.timeout ?? null,
      },
      metadata: parseJsonField(entity.metadata) ?? parseJsonField(entity.payload),
      createdAt: toDateString(entity.createdAt),
      updatedAt: toDateString(entity.updatedAt),
    };
  });
}
