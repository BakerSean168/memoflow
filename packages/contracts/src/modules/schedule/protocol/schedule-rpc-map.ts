import type { ScheduleId, ScheduleTaskId } from '../../../primitives';
import type {
  CreateScheduleRequest,
  UpdateScheduleRequest,
} from '../api/requests/schedule-requests';
import type { ScheduleTaskQueryParamsDTO } from '../api/requests/schedule-task-requests';
import type { ScheduleExecutionQueryParamsDTO } from '../api/requests/schedule-execution-requests';
import type { CalendarEntryClientDTO } from '../aggregates/calendar-entry-client';
import type { ScheduleTaskClientDTO } from '../aggregates/schedule-task-client';
import type { ScheduleExecutionClientDTO } from '../entities/schedule-execution-client';
import type { ConflictDetectionResult } from '../value-objects/conflict-detection-result';

// === Schedule Module RPC Map ===
// Residual 631: delete success bodies are void (null); dual ScheduleOperation*ResponseDTO retired.
export type ScheduleRpcMap = {
  // === Schedule (Calendar Events) Operations ===
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

  // === Raw ScheduleTask diagnostics (read-only) ===
  // Worker-job mutation is internal Scheduler persistence owned through
  // owner-domain commands -> SchedulingPort.
  'schedule-task:query': [ScheduleTaskQueryParamsDTO, ScheduleTaskClientDTO[]];

  // === Schedule Execution Records ===
  'schedule-execution:query': [
    ScheduleExecutionQueryParamsDTO,
    { items: ScheduleExecutionClientDTO[]; total: number; page: number; limit: number },
  ];
  'schedule-execution:get-stats': [{ taskId: ScheduleTaskId }, unknown];
};
