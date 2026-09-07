/** Read-only ScheduleTask IPC adapter for Electron desktop. */
import type { Result } from '@memoflow/contracts/result';
import { ScheduleChannels } from '@memoflow/contracts/electron';
import type { SourceModule, ScheduleTaskClientDTO } from '@memoflow/contracts/schedule';
import type { IResultIpcClient, IScheduleTaskApiClient } from '../types';

export class ScheduleTaskIpcAdapter implements IScheduleTaskApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async getTasks(): Promise<Result<ScheduleTaskClientDTO[]>> {
    return this.ipcClient.invoke(ScheduleChannels.TASK_LIST);
  }

  async getTaskById(taskId: string): Promise<Result<ScheduleTaskClientDTO>> {
    return this.ipcClient.invoke(ScheduleChannels.TASK_GET_BY_ID, taskId);
  }

  async getDueTasks(params?: {
    beforeTime?: string;
    limit?: number;
  }): Promise<Result<ScheduleTaskClientDTO[]>> {
    return this.ipcClient.invoke(ScheduleChannels.TASK_GET_DUE, params);
  }

  async getTaskBySource(
    sourceModule: SourceModule,
    sourceEntityId: string,
  ): Promise<Result<ScheduleTaskClientDTO[]>> {
    return this.ipcClient.invoke(ScheduleChannels.TASK_GET_BY_SOURCE, sourceModule, sourceEntityId);
  }
}

export function createScheduleTaskIpcAdapter(ipcClient: IResultIpcClient): ScheduleTaskIpcAdapter {
  return new ScheduleTaskIpcAdapter(ipcClient);
}
