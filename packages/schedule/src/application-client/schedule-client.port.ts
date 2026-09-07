import type { Result } from '@memoflow/contracts/result';
import type {
  CalendarEntryClientDTO,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  GetSchedulesByTimeRangeRequest,
  ConflictDetectionResult,
  ResolveConflictRequest,
} from '@memoflow/contracts/schedule';

/** Product-facing Planner/Calendar client capability. */
export interface ScheduleClientPort {
  createSchedule(data: CreateScheduleRequest): Promise<Result<CalendarEntryClientDTO>>;
  getSchedule(id: string): Promise<Result<CalendarEntryClientDTO>>;
  getSchedulesByAccount(): Promise<Result<CalendarEntryClientDTO[]>>;
  getSchedulesByTimeRange(
    params: GetSchedulesByTimeRangeRequest,
  ): Promise<Result<CalendarEntryClientDTO[]>>;
  updateSchedule(id: string, data: UpdateScheduleRequest): Promise<Result<CalendarEntryClientDTO>>;
  deleteSchedule(id: string, expectedVersion: number): Promise<Result<void>>;
  getScheduleConflicts(id: string): Promise<Result<ConflictDetectionResult>>;
  detectConflicts(params: {
    startTime: number;
    endTime: number;
    excludeId?: string;
  }): Promise<Result<ConflictDetectionResult>>;
  createScheduleWithConflictDetection(
    request: CreateScheduleRequest,
  ): Promise<Result<{ schedule: CalendarEntryClientDTO; conflicts?: ConflictDetectionResult }>>;
  resolveConflict(
    scheduleId: string,
    request: ResolveConflictRequest,
  ): Promise<
    Result<{
      schedule: CalendarEntryClientDTO;
      conflicts: ConflictDetectionResult;
      applied: {
        strategy: string;
        previousStartTime?: number;
        previousEndTime?: number;
        changes: string[];
      };
    }>
  >;
}
