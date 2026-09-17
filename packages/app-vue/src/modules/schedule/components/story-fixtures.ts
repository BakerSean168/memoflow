import type {
  CalendarEntryClientDTO,
  ConflictDetectionResult,
  ScheduleTaskClientDTO,
} from '@memoflow/contracts/schedule';
import type { CalendarEventItem } from '../composables/useCalendarView';

const asScheduleId = (value: string) => value as CalendarEntryClientDTO['id'];
const asIdentityId = (value: string) => value as CalendarEntryClientDTO['identityId'];
const asScheduleTaskId = (value: string) => value as ScheduleTaskClientDTO['id'];
const asTaskIdentityId = (value: string) => value as ScheduleTaskClientDTO['identityId'];
const toIso = (value: number | null) => (value == null ? null : new Date(value).toISOString());

type ScheduleEventStoryOverrides = Omit<Partial<CalendarEntryClientDTO>, 'id' | 'identityId'> & {
  id?: string;
  identityId?: string;
};

type ScheduleTaskStoryOverrides = Omit<
  Partial<ScheduleTaskClientDTO>,
  'id' | 'identityId' | 'name' | 'schedule' | 'execution' | 'retryPolicy' | 'metadata'
> & {
  id?: string;
  identityId?: string;
  name?: string;
  schedule?: Partial<ScheduleTaskClientDTO['schedule']>;
  execution?: Partial<ScheduleTaskClientDTO['execution']>;
  retryPolicy?: Partial<ScheduleTaskClientDTO['retryPolicy']>;
  metadata?: Partial<ScheduleTaskClientDTO['metadata']>;
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

export function createScheduleStoryTask(
  overrides: ScheduleTaskStoryOverrides = {},
): ScheduleTaskClientDTO {
  const now = Date.now();
  const {
    id,
    identityId,
    name,
    schedule: scheduleOverrides,
    execution: executionOverrides,
    retryPolicy: retryPolicyOverrides,
    metadata: metadataOverrides,
    ...restOverrides
  } = overrides;

  const schedule: ScheduleTaskClientDTO['schedule'] = {
    cronExpression: '0 9 * * *',
    timezone: 'Asia/Shanghai',
    startDate: null,
    endDate: null,
    maxExecutions: null,
    ...(scheduleOverrides ?? {}),
  };

  const execution: ScheduleTaskClientDTO['execution'] = {
    nextRunAt: toIso(now + 86_400_000),
    lastRunAt: toIso(now - 3_600_000),
    executionCount: 12,
    lastExecutionStatus: 'Success',
    lastExecutionDuration: 2300,
    consecutiveFailures: 0,
    ...(executionOverrides ?? {}),
  };

  const retryPolicy: ScheduleTaskClientDTO['retryPolicy'] = {
    enabled: true,
    maxRetries: 3,
    retryDelay: 60_000,
    backoffMultiplier: 2,
    maxRetryDelay: 3_600_000,
    ...(retryPolicyOverrides ?? {}),
  };

  const metadata: ScheduleTaskClientDTO['metadata'] = {
    payload: {},
    tags: ['task'],
    priority: 'Normal',
    timeout: null,
    ...(metadataOverrides ?? {}),
  };

  return {
    id: asScheduleTaskId(id ?? 'task-1'),
    identityId: asTaskIdentityId(identityId ?? 'user-1'),
    name: name ?? 'Schedule task',
    description: null,
    sourceModule: 'Task',
    sourceEntityId: 'entity-1',
    status: 'Active',
    enabled: true,
    schedule,
    execution,
    retryPolicy,
    metadata,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    executions: null,
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
