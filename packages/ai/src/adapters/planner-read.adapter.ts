import {
  CalendarEntryResponseSchema,
  type CalendarEntryClientDTO,
  type CalendarEventProjection,
  type PlannerConflictProjection,
} from '@memoflow/schedule-contracts';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/task-contracts';
import type { Context } from '@memoflow/transport-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import { unwrap } from '@memoflow/transport-contracts/result';
import { createTimeFacade, type UserTimeContext } from '@memoflow/time';
import { IdentityId } from '@memoflow/utils/domain';
import type { IAIPlannerReadPort } from '../server/application/ports/planner-read.port';
import {
  projectPlannerCalendarEntry,
  projectPlannerTaskOccurrence,
  type PlannerProductTimePort,
} from '../server/application/services/planner-owner-projection';

/**
 * Owner capabilities the Planner read adapter calls.
 *
 * Only the shapes actually used are declared, so API and Desktop can bind their
 * own Schedule/Task/Time owners without AI importing either feature module.
 */
export interface PlannerReadAdapterDeps {
  readonly scheduleEvents: {
    listEvents(
      query: { readonly identityId: string; readonly startTime: number; readonly endTime: number },
      context: Context,
    ): Promise<Result<unknown>>;
  };
  readonly tasks: {
    getTaskOccurrencesByDateRange(
      identityId: string,
      start: number,
      end: number,
    ): Promise<Result<{ readonly data: readonly TaskOccurrenceClientDTO[] }>>;
    listTaskPlans(query: {
      readonly identityId: string;
    }): Promise<Result<{ readonly plans: readonly TaskPlanClientDTO[] }>>;
  };
  readonly userTime: {
    getUserTimeContext(identityId: string): Promise<UserTimeContext>;
  };
  /** Planner conflict derivation stays owned by the Schedule client surface. */
  deriveConflicts(
    projections: readonly CalendarEventProjection[],
  ): readonly PlannerConflictProjection[];
}

function ownerContext(identityId: string, startedAt: number): Context {
  const requestId = `ai-planner:${identityId}:${startedAt}`;
  return { identityId, requestId, traceId: requestId, startedAt, source: 'system' };
}

/** Canonical Planner adapter over Schedule/Task owner application reads only. */
export function createPlannerReadAdapter(deps: PlannerReadAdapterDeps): IAIPlannerReadPort {
  async function readProjections(
    identityId: string,
    range: { readonly start: number; readonly end: number },
  ): Promise<readonly CalendarEventProjection[]> {
    const [scheduleResult, occurrenceResult, planResult, userTimeContext] = await Promise.all([
      deps.scheduleEvents.listEvents(
        {
          identityId: IdentityId.of(identityId),
          startTime: range.start,
          endTime: range.end,
        },
        ownerContext(identityId, range.start),
      ),
      deps.tasks.getTaskOccurrencesByDateRange(identityId, range.start, range.end),
      deps.tasks.listTaskPlans({ identityId: IdentityId.of(identityId) }),
      deps.userTime.getUserTimeContext(identityId),
    ]);

    const scheduleEntries: CalendarEntryClientDTO[] = CalendarEntryResponseSchema.array().parse(
      unwrap(scheduleResult),
    );
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

  const getWindowSummary: IAIPlannerReadPort['getWindowSummary'] = async (input) => {
    const projections = await readProjections(input.identityId, input.range);
    return {
      range: input.range,
      projections,
      conflicts: deps.deriveConflicts(projections),
    };
  };

  return {
    getWindowSummary,

    async getConflicts(input) {
      const summary = await getWindowSummary(input);
      return { range: input.range, conflicts: summary.conflicts };
    },

    async getUpcomingTasks(input) {
      const summary = await getWindowSummary(input);
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
    },
  };
}
