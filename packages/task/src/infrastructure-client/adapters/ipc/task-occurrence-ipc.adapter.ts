/**
 * Task Instance IPC Adapter
 *
 * IPC implementation of ITaskOccurrenceApiClient for Electron desktop.
 * Uses ResultIpcClient — all methods return Result<T> directly.
 */

import type { Result } from '@memoflow/contracts/result';
import { TaskChannels } from '@memoflow/contracts/electron';
import type { ITaskOccurrenceApiClient, IResultIpcClient } from '../types';
import type {
  GetTaskOccurrencesByRangeReq,
  TaskOccurrenceClientDTO,
  CompleteTaskOccurrenceReq,
  MarkTaskOccurrenceMissedReq,
  SkipTaskOccurrenceReq,
  RescheduleTaskInput,
  SetTaskOccurrenceChecklistItemReq,
} from '@memoflow/contracts/task';

export class TaskOccurrenceIpcAdapter implements ITaskOccurrenceApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async getTaskOccurrences(params?: {
    page?: number;
    limit?: number;
    planId?: string;
    status?: string;
  }): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return this.ipcClient.invoke(TaskChannels.OCCURRENCE_LIST, params);
  }

  async getTaskOccurrencesByDateRange(
    request: GetTaskOccurrencesByRangeReq,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return this.ipcClient.invoke(TaskChannels.OCCURRENCE_LIST_BY_DATE_RANGE, request);
  }

  async getTaskOccurrenceById(id: string): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.OCCURRENCE_GET, { id });
  }

  async deleteTaskOccurrence(id: string): Promise<Result<void>> {
    return this.ipcClient.invoke(TaskChannels.OCCURRENCE_DELETE, { id });
  }

  async startTaskOccurrence(id: string): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.OCCURRENCE_CREATE, { id });
  }

  async completeTaskOccurrence(
    id: string,
    request?: CompleteTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.OCCURRENCE_COMPLETE, { id, request });
  }

  async uncompleteTaskOccurrence(id: string): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.OCCURRENCE_UNCOMPLETE, { id });
  }

  async skipTaskOccurrence(
    id: string,
    request?: SkipTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.OCCURRENCE_SKIP, { id, request });
  }

  async markTaskOccurrenceMissed(
    id: string,
    request?: MarkTaskOccurrenceMissedReq,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.OCCURRENCE_MARK_MISSED, { id, request });
  }

  async rescheduleTaskOccurrence(
    id: string,
    request: RescheduleTaskInput,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.OCCURRENCE_RESCHEDULE, {
      occurrenceId: id,
      scheduleSnapshot: request.scheduleSnapshot,
      expectedVersion: request.expectedVersion,
    });
  }

  async setTaskOccurrenceChecklistItem(
    id: string,
    request: SetTaskOccurrenceChecklistItemReq,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.OCCURRENCE_CHECKLIST_SET, { id, request });
  }
}

export function createTaskOccurrenceIpcAdapter(
  ipcClient: IResultIpcClient,
): TaskOccurrenceIpcAdapter {
  return new TaskOccurrenceIpcAdapter(ipcClient);
}
