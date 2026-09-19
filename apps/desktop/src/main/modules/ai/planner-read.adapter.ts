import type { Context } from '@memoflow/contracts/shared';
import { CalendarEntryResponseSchema } from '@memoflow/contracts/schedule';
import { unwrap } from '@memoflow/contracts/result';
import {
  projectPlannerCalendarEntry,
  projectPlannerTaskOccurrence,
  type IAIPlannerReadPort,
  type PlannerProductTimePort,
} from '@memoflow/ai';
import { IdentityId } from '@memoflow/domain-shared/shared';
import type { ScheduleEventApplicationPort } from '@memoflow/schedule';
import { derivePlannerConflicts } from '@memoflow/schedule/client';
import type { TaskApplicationPort } from '@memoflow/task';
import { createTimeFacade, type UserTimeContextPort } from '@memoflow/time';

function ownerContext(identityId: string, startedAt: number): Context {
  const requestId = `ai-planner:${identityId}:${startedAt}`;
  return { identityId, requestId, traceId: requestId, startedAt, source: 'system' };
}

/** Planner adapter over Schedule/Task owner application reads only. */
export class DesktopPlannerAIReadAdapter implements IAIPlannerReadPort {
  constructor(
    private readonly scheduleEventApi: ScheduleEventApplicationPort,
    private readonly taskApplicationPort: TaskApplicationPort,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {}

  private async readProjections(
    identityId: string,
    range: { readonly start: number; readonly end: number },
  ) {
    const [scheduleResult, occurrenceResult, planResult, userTimeContext] = await Promise.all([
      this.scheduleEventApi.listEvents(
        {
          identityId: IdentityId.of(identityId),
          startTime: range.start,
          endTime: range.end,
        },
        ownerContext(identityId, range.start),
      ),
      this.taskApplicationPort.getTaskOccurrencesByDateRange(identityId, range.start, range.end),
      this.taskApplicationPort.listTaskPlans({ identityId: IdentityId.of(identityId) }),
      this.userTimeContextPort.getUserTimeContext(identityId),
    ]);

    const scheduleEntries = CalendarEntryResponseSchema.array().parse(unwrap(scheduleResult));
    const occurrences = unwrap(occurrenceResult).data;
    const plans = unwrap(planResult).plans;
    const planById = new Map(plans.map((plan) => [String(plan.id), plan] as const));
    const time = createTimeFacade({ context: userTimeContext });
    const productTime: PlannerProductTimePort = {
      combine: (date, hm) => time.input.combine(date, hm),
    };
    return [
      ...scheduleEntries.map(projectPlannerCalendarEntry),
      ...occurrences.flatMap((occurrence) => {
        const projection = projectPlannerTaskOccurrence(
          occurrence,
          planById.get(String(occurrence.planId)),
          productTime,
        );
        return projection ? [projection] : [];
      }),
    ];
  }

  async getWindowSummary(input: Parameters<IAIPlannerReadPort['getWindowSummary']>[0]) {
    const projections = await this.readProjections(input.identityId, input.range);
    return {
      range: input.range,
      projections,
      conflicts: derivePlannerConflicts(projections),
    };
  }

  async getConflicts(input: Parameters<IAIPlannerReadPort['getConflicts']>[0]) {
    const summary = await this.getWindowSummary(input);
    return { range: input.range, conflicts: summary.conflicts };
  }

  async getUpcomingTasks(input: Parameters<IAIPlannerReadPort['getUpcomingTasks']>[0]) {
    const summary = await this.getWindowSummary(input);
    return summary.projections
      .filter(
        (projection): projection is Extract<typeof projection, { sourceType: 'task' }> =>
          projection.sourceType === 'task' &&
          !['Completed', 'Skipped', 'Missed'].includes(projection.displayMetadata.status ?? ''),
      )
      .sort((left, right) => {
        if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
        return String(left.start).localeCompare(String(right.start));
      })
      .slice(0, input.limit ?? 20);
  }
}
