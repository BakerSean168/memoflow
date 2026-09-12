/**
 * Task Instance HTTP Adapter
 *
 * HTTP implementation of ITaskOccurrenceApiClient.
 * Uses IResultHttpClient for making HTTP requests.
 */

import type { Result } from '@memoflow/contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { ITaskOccurrenceApiClient } from '../types';
import type {
  GetTaskOccurrencesByRangeReq,
  TaskOccurrenceClientDTO,
  CompleteTaskOccurrenceReq,
  MarkTaskOccurrenceMissedReq,
  SkipTaskOccurrenceReq,
  RescheduleTaskInput,
} from '@memoflow/contracts/task';

/**
 * TaskOccurrenceHttpAdapter
 *
 * HTTP implementation of the task instance API client.
 */
export class TaskOccurrenceHttpAdapter implements ITaskOccurrenceApiClient {
  private readonly baseUrl = '/task-occurrences';

  constructor(private readonly httpClient: IResultHttpClient) {}

  // ===== Task Instance CRUD =====

  async getTaskOccurrences(params?: {
    page?: number;
    limit?: number;
    templateId?: string;
    status?: string;
  }): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return this.httpClient.get(this.baseUrl, { params });
  }

  async getTaskOccurrencesByDateRange(
    request: GetTaskOccurrencesByRangeReq,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return this.httpClient.get(`${this.baseUrl}/by-date-range`, {
      params: request,
    });
  }

  async getTaskOccurrenceById(id: string): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.httpClient.get(`${this.baseUrl}/${id}`);
  }

  async deleteTaskOccurrence(id: string): Promise<Result<void>> {
    return this.httpClient.delete(`${this.baseUrl}/${id}`);
  }

  // ===== Task Instance State Management =====

  async startTaskOccurrence(id: string): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/start`);
  }

  async completeTaskOccurrence(
    id: string,
    request?: CompleteTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/complete`, request);
  }

  async uncompleteTaskOccurrence(id: string): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/uncomplete`);
  }

  async skipTaskOccurrence(
    id: string,
    request?: SkipTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/skip`, request);
  }

  async markTaskOccurrenceMissed(
    id: string,
    request?: MarkTaskOccurrenceMissedReq,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/missed`, request);
  }

  async rescheduleTaskOccurrence(
    id: string,
    request: RescheduleTaskInput,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/reschedule`, request);
  }
}

/**
 * Factory function to create TaskOccurrenceHttpAdapter
 */
export function createTaskOccurrenceHttpAdapter(
  httpClient: IResultHttpClient,
): TaskOccurrenceHttpAdapter {
  return new TaskOccurrenceHttpAdapter(httpClient);
}
