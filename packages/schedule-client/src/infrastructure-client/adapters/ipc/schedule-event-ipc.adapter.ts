/**
 * Schedule Event IPC Adapter
 *
 * IPC implementation of IScheduleEventApiClient for Electron desktop apps.
 * Uses ResultIpcClient — all methods return Result<T> directly.
 */

import type { Result } from '@memoflow/transport-contracts/result';
import { ScheduleChannels } from '@memoflow/desktop-contracts';
import type { IResultIpcClient, IScheduleEventApiClient } from '../types';
import type {
  CalendarEntryClientDTO,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  GetSchedulesByTimeRangeRequest,
  ConflictDetectionResult,
  ResolveConflictRequest,
} from '@memoflow/schedule-contracts';

export class ScheduleEventIpcAdapter implements IScheduleEventApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  // ===== Schedule Event CRUD =====

  async createSchedule(data: CreateScheduleRequest): Promise<Result<CalendarEntryClientDTO>> {
    return this.ipcClient.invoke(ScheduleChannels.CREATE, data);
  }

  async getSchedule(id: string): Promise<Result<CalendarEntryClientDTO>> {
    return this.ipcClient.invoke(ScheduleChannels.GET, id);
  }

  async getSchedulesByAccount(): Promise<Result<CalendarEntryClientDTO[]>> {
    return this.ipcClient.invoke(ScheduleChannels.LIST);
  }

  async getSchedulesByTimeRange(
    params: GetSchedulesByTimeRangeRequest,
  ): Promise<Result<CalendarEntryClientDTO[]>> {
    return this.ipcClient.invoke(ScheduleChannels.LIST_BY_DATE_RANGE, params);
  }

  async updateSchedule(
    id: string,
    data: UpdateScheduleRequest,
  ): Promise<Result<CalendarEntryClientDTO>> {
    return this.ipcClient.invoke(ScheduleChannels.UPDATE, id, data);
  }

  async deleteSchedule(id: string, expectedVersion: number): Promise<Result<void>> {
    return this.ipcClient.invoke(ScheduleChannels.DELETE, id, { expectedVersion });
  }

  // ===== Schedule Conflict Detection =====

  async getScheduleConflicts(id: string): Promise<Result<ConflictDetectionResult>> {
    return this.ipcClient.invoke(ScheduleChannels.GET_CONFLICTS, id);
  }

  async detectConflicts(params: {
    startTime: number;
    endTime: number;
    excludeId?: string;
  }): Promise<Result<ConflictDetectionResult>> {
    return this.ipcClient.invoke(ScheduleChannels.DETECT_CONFLICTS, params);
  }

  async createScheduleWithConflictDetection(request: CreateScheduleRequest): Promise<
    Result<{
      schedule: CalendarEntryClientDTO;
      conflicts?: ConflictDetectionResult;
    }>
  > {
    return this.ipcClient.invoke(ScheduleChannels.CREATE_WITH_CONFLICT_DETECTION, request);
  }

  async resolveConflict(
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
    return this.ipcClient.invoke(ScheduleChannels.RESOLVE_CONFLICT, scheduleId, request);
  }
}

export function createScheduleEventIpcAdapter(
  ipcClient: IResultIpcClient,
): ScheduleEventIpcAdapter {
  return new ScheduleEventIpcAdapter(ipcClient);
}
