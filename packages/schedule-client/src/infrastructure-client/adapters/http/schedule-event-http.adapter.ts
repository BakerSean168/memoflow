/**
 * Schedule Event HTTP Adapter
 *
 * HTTP implementation of IScheduleEventApiClient.
 */

import type { Result } from '@memoflow/transport-contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { IScheduleEventApiClient } from '../types';
import type {
  CalendarEntryClientDTO,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  GetSchedulesByTimeRangeRequest,
  ConflictDetectionResult,
  ResolveConflictRequest,
} from '@memoflow/schedule-contracts';

/**
 * ScheduleEventHttpAdapter
 *
 * HTTP 实现的日程事件 API 客户端
 */
export class ScheduleEventHttpAdapter implements IScheduleEventApiClient {
  private readonly baseUrl = '/schedules/events';

  constructor(private readonly httpClient: IResultHttpClient) {}

  // ===== Schedule Event CRUD =====

  async createSchedule(data: CreateScheduleRequest): Promise<Result<CalendarEntryClientDTO>> {
    return this.httpClient.post(this.baseUrl, data);
  }

  async getSchedule(id: string): Promise<Result<CalendarEntryClientDTO>> {
    return this.httpClient.get(`${this.baseUrl}/${id}`);
  }

  async getSchedulesByAccount(): Promise<Result<CalendarEntryClientDTO[]>> {
    return this.httpClient.get(this.baseUrl);
  }

  async getSchedulesByTimeRange(
    params: GetSchedulesByTimeRangeRequest,
  ): Promise<Result<CalendarEntryClientDTO[]>> {
    return this.httpClient.get(this.baseUrl, {
      params: params as unknown as Record<string, unknown>,
    });
  }

  async updateSchedule(
    id: string,
    data: UpdateScheduleRequest,
  ): Promise<Result<CalendarEntryClientDTO>> {
    return this.httpClient.patch(`${this.baseUrl}/${id}`, data);
  }

  async deleteSchedule(id: string, expectedVersion: number): Promise<Result<void>> {
    return this.httpClient.delete(`${this.baseUrl}/${id}`, { data: { expectedVersion } });
  }

  // ===== Schedule Conflict Detection =====

  async getScheduleConflicts(id: string): Promise<Result<ConflictDetectionResult>> {
    return this.httpClient.get(`${this.baseUrl}/${id}/conflicts`);
  }

  async detectConflicts(params: {
    startTime: number;
    endTime: number;
    excludeId?: string;
  }): Promise<Result<ConflictDetectionResult>> {
    return this.httpClient.post(`${this.baseUrl}/conflicts/detect`, params);
  }

  async createScheduleWithConflictDetection(request: CreateScheduleRequest): Promise<
    Result<{
      schedule: CalendarEntryClientDTO;
      conflicts?: ConflictDetectionResult;
    }>
  > {
    return this.httpClient.post(`${this.baseUrl}/with-conflict-detection`, request);
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
    return this.httpClient.post(`${this.baseUrl}/${scheduleId}/resolve-conflict`, request);
  }
}

/**
 * Factory function to create ScheduleEventHttpAdapter
 */
export function createScheduleEventHttpAdapter(
  httpClient: IResultHttpClient,
): ScheduleEventHttpAdapter {
  return new ScheduleEventHttpAdapter(httpClient);
}
