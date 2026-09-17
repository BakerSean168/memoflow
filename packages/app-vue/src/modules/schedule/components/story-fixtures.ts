import type {
  CalendarEntryClientDTO,
  ConflictDetectionResult,
} from '@memoflow/contracts/schedule';
import type { CalendarEventItem } from '../composables/useCalendarView';

const asScheduleId = (value: string) => value as CalendarEntryClientDTO['id'];
const asIdentityId = (value: string) => value as CalendarEntryClientDTO['identityId'];

type ScheduleEventStoryOverrides = Omit<Partial<CalendarEntryClientDTO>, 'id' | 'identityId'> & {
  id?: string;
  identityId?: string;
};


export function createScheduleStoryEvent(
  overrides: ScheduleEventStoryOverrides = {},
): CalendarEntryClientDTO {
  const now = Date.now();
  const { id, identityId, ...restOverrides } = overrides;

  return {
    id: asScheduleId(id ?? 'schedule-1'),
    identityId: asIdentityId(identityId ?? 'user-1'),
    title: 'Schedule event',
    description: undefined,
    range: { kind: 'Timed', start: now, end: now + 60 * 60 * 1000 },
    location: undefined,
    attendees: undefined,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...restOverrides,
  };
}

export function createCalendarStoryEvent(
  overrides: Partial<CalendarEventItem> = {},
): CalendarEventItem {
  const now = Date.now();

  return {
    id: 'calendar-event-1',
    title: 'Schedule event',
    startTime: now,
    endTime: now + 60 * 60 * 1000,
    displayMode: 'timed',
    source: 'schedule',
    hasConflict: false,
    originalId: 'schedule-1',
    ...overrides,
  };
}

export function createScheduleConflict(
  overrides: Partial<ConflictDetectionResult> = {},
): ConflictDetectionResult {
  return {
    hasConflict: true,
    conflicts: [
      {
        scheduleId: asScheduleId('schedule-1'),
        scheduleTitle: 'Schedule event',
        overlapStart: Date.now(),
        overlapEnd: Date.now() + 30 * 60 * 1000,
        overlapDuration: 30 * 60 * 1000,
        severity: 'Moderate',
      },
    ],
    suggestions: [],
    ...overrides,
  };
}
