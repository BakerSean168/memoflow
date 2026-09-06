import type { Result } from '@memoflow/contracts/result';
import type {
  CalendarEntryClientDTO,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  GetSchedulesByTimeRangeRequest,
  ConflictDetectionResult,
  ResolveConflictRequest,
  SourceModule,
} from '@memoflow/contracts/schedule';
import type { ScheduleTask } from '../domain-client/aggregates/schedule-task';

/**
 * Product-facing Schedule client capability.
 *
 * Calendar entries remain normal product commands. Raw ScheduleTask worker jobs
 * are exposed read-only for diagnostics; worker mutation is internal Scheduler
 * persistence driven by owner-domain commands -> SchedulingPort.
 */
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

  getTasks(): Promise<Result<ScheduleTask[]>>;
  getTaskById(taskId: string): Promise<Result<ScheduleTask>>;
  getDueTasks(params?: { beforeTime?: string; limit?: number }): Promise<Result<ScheduleTask[]>>;
  getTaskBySource(
    sourceModule: SourceModule,
    sourceEntityId: string,
  ): Promise<Result<ScheduleTask[]>>;
}
