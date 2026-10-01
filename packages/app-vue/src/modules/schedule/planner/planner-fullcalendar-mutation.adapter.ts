import type { EventApi, EventDropInfo, EventResizeDoneInfo } from '@fullcalendar/vue3';
import type { CalendarEventProjection, PlannerEventRange } from '@memoflow/contracts/schedule';
import { asInstant } from '@memoflow/time';
import {
  applyPlannerOptimisticMutation,
  type PlannerOptimisticMutationInput,
} from './planner-optimistic-mutation.adapter';
import type {
  PlannerMutationKind,
  PlannerMutationOutcome,
  PlannerMutationTimePort,
  PlannerOwnerCommandRouter,
} from './planner-owner-command.router';

export type PlannerFullCalendarMutationInfo = Pick<
  EventDropInfo | EventResizeDoneInfo,
  'event' | 'revert'
>;

function projectionOf(event: EventApi): CalendarEventProjection | null {
  const projection = event.extendedProps.projection as CalendarEventProjection | undefined;
  return projection ?? null;
}

export function fullCalendarEventToPlannerRange(
  event: EventApi,
  projection: CalendarEventProjection,
  time: PlannerMutationTimePort,
): PlannerEventRange | null {
  if (event.start == null || !Number.isFinite(event.start.getTime())) return null;
  if (event.end != null && (!Number.isFinite(event.end.getTime()) || event.end <= event.start))
    return null;
  const start = asInstant(event.start.getTime());

  if (event.allDay) {
    return {
      allDay: true,
      start: time.toYmd(start),
      end:
        projection.allDay && projection.end != null && event.end != null
          ? time.toYmd(asInstant(event.end.getTime()))
          : null,
    };
  }

  return {
    allDay: false,
    start,
    end: event.end == null ? null : asInstant(event.end.getTime()),
  };
}

// FullCalendar creates one rollback closure per visual mutation. Replaying that
// callback must share its outcome; a new closure always represents a new gesture.
const mutations = new WeakMap<
  PlannerOwnerCommandRouter,
  WeakMap<() => void, Promise<PlannerMutationOutcome>>
>();

export function applyFullCalendarPlannerMutation(
  kind: PlannerMutationKind,
  info: PlannerFullCalendarMutationInfo,
  router: PlannerOwnerCommandRouter,
  time: PlannerMutationTimePort,
): Promise<PlannerMutationOutcome> {
  let ownerMutations = mutations.get(router);
  if (!ownerMutations) {
    ownerMutations = new WeakMap();
    mutations.set(router, ownerMutations);
  }
  const existing = ownerMutations.get(info.revert);
  if (existing) return existing;
  // Register before dispatch so concurrent callbacks cannot issue a second write.
  const outcome = Promise.resolve().then(() => applyMutation(kind, info, router, time));
  ownerMutations.set(info.revert, outcome);
  return outcome;
}

/** Concrete eventDrop/eventResize bridge used by the FullCalendar migration slice. */
async function applyMutation(
  kind: PlannerMutationKind,
  info: PlannerFullCalendarMutationInfo,
  router: PlannerOwnerCommandRouter,
  time: PlannerMutationTimePort,
): Promise<PlannerMutationOutcome> {
  const projection = projectionOf(info.event);
  if (!projection) {
    info.revert();
    return { status: 'invalid', message: 'FullCalendar event is missing CalendarEventProjection' };
  }
  let nextRange: PlannerEventRange | null;
  try {
    nextRange = fullCalendarEventToPlannerRange(info.event, projection, time);
  } catch {
    nextRange = null;
  }
  if (!nextRange) {
    info.revert();
    return { status: 'invalid', message: 'FullCalendar event has no valid start' };
  }
  const mutation: PlannerOptimisticMutationInput = {
    kind,
    projection,
    nextRange,
    revert: info.revert,
  };
  return applyPlannerOptimisticMutation(router, mutation);
}
