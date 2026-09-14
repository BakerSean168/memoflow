/** Pure canonical-schedule policies for Task occurrence generation. */

import { createTimeFacade, type TimeContext } from '@memoflow/time';
import type { Ymd } from '@memoflow/contracts/primitives';
import {
  TaskPlanScheduleKind,
  type ChecklistItemDefinitionDTO,
  type TaskPlanSchedule,
} from '@memoflow/contracts/task';
import { TaskPlanStatus } from '../../domain/value-objects/task-plan-status';
import { InvalidDateRangeError, InvalidTaskPlanStateError } from '../value-objects/task-errors';
import { TaskOccurrenceScheduleSnapshot } from '../value-objects';
import type { ImportanceLevel } from '@memoflow/contracts/shared';
import type { IdentityId } from '@memoflow/domain-shared';
import type { TaskPlanId } from '../../domain/value-objects/task-plan-id';
import { TaskOccurrence } from './task-occurrence';
import { nextRecurrenceDate, recurrenceDatesBetween, recurrenceOccursOn } from './task-recurrence-date.adapter';

export interface OccurrenceGenerationContext {
  planId: TaskPlanId;
  identityId: IdentityId;
  status: TaskPlanStatus;
  schedule: TaskPlanSchedule;
  importance: ImportanceLevel;
  checklistDefinition: readonly ChecklistItemDefinitionDTO[];
  existingOccurrences: readonly { scheduleDate: Ymd; deletedAt: number | null }[];
  timeContext: TimeContext;
}

export interface OccurrenceGenerationResult {
  occurrences: TaskOccurrence[];
}

export interface CreateOccurrenceParams {
  occurrenceDate: number;
}

export function startOfLocalDay(value: number, timeContext: TimeContext): number {
  return createTimeFacade({ context: timeContext }).calendar.startOfDay(value);
}

function ymdStart(date: Ymd, timeContext: TimeContext): number {
  return Number(createTimeFacade({ context: timeContext }).codec.startOfYmd(date));
}

function hasOccurrenceOnDate(ctx: OccurrenceGenerationContext, date: number): boolean {
  const ymd = createTimeFacade({ context: ctx.timeContext }).calendar.toYmd(date);
  return ctx.existingOccurrences.some(
    (occurrence) => !occurrence.deletedAt && occurrence.scheduleDate === ymd,
  );
}

export function createOccurrenceFromPlan(
  ctx: OccurrenceGenerationContext,
  params: CreateOccurrenceParams,
): TaskOccurrence {
  if (ctx.status !== TaskPlanStatus.Active) {
    throw new InvalidTaskPlanStateError('Can only create occurrences for active task plans', {
      planId: ctx.planId,
      currentStatus: ctx.status,
      attemptedAction: 'createOccurrence',
    });
  }
  if (typeof params.occurrenceDate !== 'number' || Number.isNaN(params.occurrenceDate)) {
    throw new InvalidTaskPlanStateError('occurrenceDate must be a valid number', {
      planId: ctx.planId,
      currentStatus: ctx.status,
      attemptedAction: 'createOccurrence',
    });
  }

  const time = createTimeFacade({ context: ctx.timeContext });
  return TaskOccurrence.create({
    planId: ctx.planId,
    identityId: ctx.identityId,
    scheduleSnapshot: TaskOccurrenceScheduleSnapshot.create({
      date: time.calendar.toYmd(params.occurrenceDate),
      timing: ctx.schedule.timing,
    }),
    importanceSnapshot: ctx.importance,
    checklistDefinition: ctx.checklistDefinition,
  });
}

function passesBusinessGenerationGuards(ctx: OccurrenceGenerationContext, candidateDay: number): boolean {
  if (ctx.status !== TaskPlanStatus.Active || ctx.schedule.kind !== TaskPlanScheduleKind.Recurring) {
    return false;
  }
  if (hasOccurrenceOnDate(ctx, candidateDay)) return false;
  if (candidateDay < ymdStart(ctx.schedule.startDate, ctx.timeContext)) return false;
  if (
    ctx.schedule.recurrence.end.kind === 'Until' &&
    candidateDay > ymdStart(ctx.schedule.recurrence.end.date, ctx.timeContext)
  ) {
    return false;
  }
  if (
    ctx.schedule.recurrence.end.kind === 'Count' &&
    ctx.existingOccurrences.filter((occurrence) => !occurrence.deletedAt).length >=
      ctx.schedule.recurrence.end.count
  ) {
    return false;
  }
  return true;
}

export function generateOccurrences(
  ctx: OccurrenceGenerationContext,
  fromDate: number,
  toDate: number,
): OccurrenceGenerationResult {
  if (fromDate >= toDate) throw new InvalidDateRangeError(fromDate, toDate);
  if (ctx.status !== TaskPlanStatus.Active) {
    throw new InvalidTaskPlanStateError('Can only generate occurrences for active plans', {
      planId: ctx.planId,
      currentStatus: ctx.status,
      attemptedAction: 'generateOccurrences',
    });
  }

  const time = createTimeFacade({ context: ctx.timeContext });
  const fromDay = startOfLocalDay(fromDate, ctx.timeContext);
  const rangeEnd = time.calendar.endOfDay(startOfLocalDay(toDate, ctx.timeContext));
  if (ctx.schedule.kind === TaskPlanScheduleKind.OneTime) {
    const targetDay = ymdStart(ctx.schedule.date, ctx.timeContext);
    if (targetDay < fromDay || targetDay > rangeEnd || hasOccurrenceOnDate(ctx, targetDay)) {
      return { occurrences: [] };
    }
    return {
      occurrences: [
        TaskOccurrence.create({
          planId: ctx.planId,
          identityId: ctx.identityId,
          scheduleSnapshot: TaskOccurrenceScheduleSnapshot.create({
            date: ctx.schedule.date,
            timing: ctx.schedule.timing,
          }),
          importanceSnapshot: ctx.importance,
          checklistDefinition: ctx.checklistDefinition,
        }),
      ],
    };
  }

  const maxOccurrences =
    ctx.schedule.recurrence.end.kind === 'Count' ? ctx.schedule.recurrence.end.count : null;
  const existingCount = ctx.existingOccurrences.filter((occurrence) => !occurrence.deletedAt).length;
  if (maxOccurrences !== null && existingCount >= maxOccurrences) return { occurrences: [] };

  const occurrences: TaskOccurrence[] = [];
  const candidateDates = recurrenceDatesBetween(
    ctx.schedule.recurrence,
    ctx.schedule.startDate,
    fromDay,
    rangeEnd,
    ctx.timeContext,
  );
  for (const candidate of candidateDates) {
    if (maxOccurrences !== null && existingCount + occurrences.length >= maxOccurrences) break;
    const candidateDay = startOfLocalDay(candidate, ctx.timeContext);
    if (!passesBusinessGenerationGuards(ctx, candidateDay)) continue;
    occurrences.push(
      TaskOccurrence.create({
        planId: ctx.planId,
        identityId: ctx.identityId,
        scheduleSnapshot: TaskOccurrenceScheduleSnapshot.create({
          date: time.calendar.toYmd(candidateDay),
          timing: ctx.schedule.timing,
        }),
        importanceSnapshot: ctx.importance,
        checklistDefinition: ctx.checklistDefinition,
      }),
    );
  }
  return { occurrences };
}

export function shouldGenerateOccurrence(ctx: OccurrenceGenerationContext, date: number): boolean {
  if (ctx.schedule.kind !== TaskPlanScheduleKind.Recurring) return false;
  const candidateDay = startOfLocalDay(date, ctx.timeContext);
  if (!passesBusinessGenerationGuards(ctx, candidateDay)) return false;
  return recurrenceOccursOn(
    ctx.schedule.recurrence,
    ctx.schedule.startDate,
    candidateDay,
    ctx.timeContext,
  );
}

export function isActiveOnDate(ctx: OccurrenceGenerationContext, date: number): boolean {
  if (ctx.status !== TaskPlanStatus.Active) return false;
  const candidateDay = startOfLocalDay(date, ctx.timeContext);
  if (ctx.schedule.kind === TaskPlanScheduleKind.OneTime) {
    return candidateDay === ymdStart(ctx.schedule.date, ctx.timeContext);
  }
  if (
    ctx.schedule.recurrence.end.kind === 'Until' &&
    candidateDay > ymdStart(ctx.schedule.recurrence.end.date, ctx.timeContext)
  ) {
    return false;
  }
  return recurrenceOccursOn(
    ctx.schedule.recurrence,
    ctx.schedule.startDate,
    candidateDay,
    ctx.timeContext,
  );
}

export function getNextOccurrence(ctx: OccurrenceGenerationContext, afterDate: number): number | null {
  if (ctx.status !== TaskPlanStatus.Active) return null;
  if (ctx.schedule.kind === TaskPlanScheduleKind.OneTime) {
    const startDate = ymdStart(ctx.schedule.date, ctx.timeContext);
    return startDate > afterDate ? startDate : null;
  }
  return nextRecurrenceDate(
    ctx.schedule.recurrence,
    ctx.schedule.startDate,
    afterDate,
    ctx.timeContext,
  );
}
