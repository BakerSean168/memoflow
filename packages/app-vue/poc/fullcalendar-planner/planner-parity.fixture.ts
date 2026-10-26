import type {
  CalendarEventProjection,
  PlannerEditableCapabilities,
  PlannerOwnerCommandTarget,
  PlannerSourceType,
} from '@memoflow/schedule-contracts';
import { asInstant, asYmd } from '@memoflow/time';

/** Browser-only PLAN-4304 parity fixture over the canonical Planner contract. */
export type CalendarEventProjectionFixture = CalendarEventProjection;
export type { PlannerEditableCapabilities, PlannerOwnerCommandTarget, PlannerSourceType };

export const plannerPocFixture: readonly CalendarEventProjection[] = [
  {
    identityId: 'identity-poc',
    sourceType: 'schedule',
    sourceId: 'schedule-deep-work',
    start: asInstant(Date.parse('2026-08-27T09:00:00+08:00')),
    end: asInstant(Date.parse('2026-08-27T10:30:00+08:00')),
    allDay: false,
    title: 'Deep work',
    displayMetadata: {
      semantic: 'calendar-entry',
      subtitle: 'Schedule · editable',
      tone: 'accent',
    },
    editableCapabilities: { move: true, resize: true },
    ownerCommandTarget: { ownerType: 'schedule.calendar-entry', ownerId: 'schedule-deep-work' },
    revision: 7,
  },
  {
    identityId: 'identity-poc',
    sourceType: 'task',
    sourceId: 'task-review-pr',
    start: asInstant(Date.parse('2026-08-28T14:00:00+08:00')),
    end: asInstant(Date.parse('2026-08-28T14:45:00+08:00')),
    allDay: false,
    title: 'Review Core vNext PR',
    displayMetadata: {
      semantic: 'task-occurrence',
      subtitle: 'Task · movable only',
      tone: 'default',
    },
    editableCapabilities: { move: true, resize: false },
    ownerCommandTarget: { ownerType: 'task.instance', ownerId: 'task-review-pr' },
    revision: 3,
  },
  {
    identityId: 'identity-poc',
    sourceType: 'goal',
    sourceId: 'goal-quarterly-review:due-date',
    start: asYmd('2026-08-29'),
    end: null,
    allDay: true,
    title: 'Quarterly goal review',
    displayMetadata: {
      semantic: 'goal-deadline',
      subtitle: 'Goal · read only',
      tone: 'muted',
    },
    editableCapabilities: { move: false, resize: false },
    ownerCommandTarget: { ownerType: 'goal.goal', ownerId: 'goal-quarterly-review' },
    revision: 12,
  },
  {
    identityId: 'identity-poc',
    sourceType: 'routine',
    sourceId: 'routine:routine-evening-wind-down:oc:1788108000000',
    start: asInstant(Date.parse('2026-08-30T22:00:00+08:00')),
    end: asInstant(Date.parse('2026-08-30T22:20:00+08:00')),
    allDay: false,
    title: 'Evening wind-down',
    displayMetadata: {
      semantic: 'routine-wall-clock',
      subtitle: 'Routine · projected',
      tone: 'default',
    },
    editableCapabilities: { move: false, resize: false },
    ownerCommandTarget: { ownerType: 'routine.routine', ownerId: 'routine-evening-wind-down' },
    revision: 4,
  },
];
