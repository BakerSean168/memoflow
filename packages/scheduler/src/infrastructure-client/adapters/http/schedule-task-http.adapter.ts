/** Read-only ScheduleTask HTTP adapter. */
import type { Result } from '@memoflow/contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { IScheduleTaskApiClient } from '../types';
import type { SourceModule, ScheduleTaskClientDTO } from '@memoflow/contracts/schedule';

export class ScheduleTaskHttpAdapter implements IScheduleTaskApiClient {
  private readonly baseUrl = '/schedules';

  constructor(private readonly httpClient: IResultHttpClient) {}

  async getTasks(): Promise<Result<ScheduleTaskClientDTO[]>> {
    return this.httpClient.get(`${this.baseUrl}/tasks`);
  }

  async getTaskById(taskId: string): Promise<Result<ScheduleTaskClientDTO>> {
    return this.httpClient.get(`${this.baseUrl}/tasks/${taskId}`);
  }

  async getDueTasks(params?: {
    beforeTime?: string;
    limit?: number;
  }): Promise<Result<ScheduleTaskClientDTO[]>> {
    return this.httpClient.get(`${this.baseUrl}/tasks/due`, { params });
  }

  async getTaskBySource(
    sourceModule: SourceModule,
    sourceEntityId: string,
  ): Promise<Result<ScheduleTaskClientDTO[]>> {
    return this.httpClient.get(`${this.baseUrl}/tasks`, {
      params: { sourceModule, sourceEntityId },
    });
  }
}

export function createScheduleTaskHttpAdapter(httpClient: IResultHttpClient): ScheduleTaskHttpAdapter {
  return new ScheduleTaskHttpAdapter(httpClient);
}
