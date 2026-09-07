import type { Result } from '@memoflow/contracts/result';
import type {
  CalendarEntryClientDTO,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  GetSchedulesByTimeRangeRequest,
  ConflictDetectionResult,
  ResolveConflictRequest,
} from '@memoflow/contracts/schedule';
import type { IScheduleEventApiClient } from './ports/schedule-event-api-client.port';
import type { ScheduleClientPort } from './schedule-client.port';

export class ScheduleClientService implements ScheduleClientPort {
  constructor(private readonly eventApi: IScheduleEventApiClient) {}

  createSchedule(data: CreateScheduleRequest): Promise<Result<CalendarEntryClientDTO>> {
    return this.eventApi.createSchedule(data);
  }
  getSchedule(id: string): Promise<Result<CalendarEntryClientDTO>> {
    return this.eventApi.getSchedule(id);
  }
  getSchedulesByAccount(): Promise<Result<CalendarEntryClientDTO[]>> {
    return this.eventApi.getSchedulesByAccount();
  }
  getSchedulesByTimeRange(
    params: GetSchedulesByTimeRangeRequest,
  ): Promise<Result<CalendarEntryClientDTO[]>> {
    return this.eventApi.getSchedulesByTimeRange(params);
  }
  updateSchedule(
    id: string,
    data: UpdateScheduleRequest,
  ): Promise<Result<CalendarEntryClientDTO>> {
    return this.eventApi.updateSchedule(id, data);
  }
  deleteSchedule(id: string, expectedVersion: number): Promise<Result<void>> {
    return this.eventApi.deleteSchedule(id, expectedVersion);
  }
  getScheduleConflicts(id: string): Promise<Result<ConflictDetectionResult>> {
    return this.eventApi.getScheduleConflicts(id);
  }
  detectConflicts(params: {
    startTime: number;
    endTime: number;
    excludeId?: string;
  }): Promise<Result<ConflictDetectionResult>> {
    return this.eventApi.detectConflicts(params);
  }
  createScheduleWithConflictDetection(
    request: CreateScheduleRequest,
  ): Promise<Result<{ schedule: CalendarEntryClientDTO; conflicts?: ConflictDetectionResult }>> {
    return this.eventApi.createScheduleWithConflictDetection(request);
  }
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
  > {
    return this.eventApi.resolveConflict(scheduleId, request);
  }
}

export function createScheduleClientService(
  eventApi: IScheduleEventApiClient,
): ScheduleClientService {
  return new ScheduleClientService(eventApi);
}
