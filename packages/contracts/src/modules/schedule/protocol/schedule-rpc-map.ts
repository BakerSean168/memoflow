import type { ScheduleId } from '../../../primitives';
import type { CreateScheduleRequest, UpdateScheduleRequest } from '../api/requests/schedule-requests';
import type { CalendarEntryClientDTO } from '../aggregates/calendar-entry-client';
import type { ConflictDetectionResult } from '../value-objects/conflict-detection-result';

/** Product Calendar RPC map. Scheduler diagnostics use their own transport namespace. */
export type ScheduleRpcMap = {
  'schedule:create': [CreateScheduleRequest, CalendarEntryClientDTO];
  'schedule:update': [UpdateScheduleRequest, CalendarEntryClientDTO];
  'schedule:delete': [{ scheduleId: ScheduleId }, null];
  'schedule:get-by-range': [{ startTime: number; endTime: number }, CalendarEntryClientDTO[]];
  'schedule:detect-conflicts': [
    { startTime: number; endTime: number; excludeId?: ScheduleId },
    ConflictDetectionResult,
  ];
  'schedule:resolve-conflict': [
    { resolution: string; newStartTime?: number; newEndTime?: number; newDuration?: number },
    CalendarEntryClientDTO,
  ];
};
