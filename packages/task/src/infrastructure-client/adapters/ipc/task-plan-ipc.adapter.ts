/**
 * Task Template IPC Adapter
 *
 * IPC implementation of ITaskPlanApiClient for Electron desktop.
 * Uses ResultIpcClient — all methods return Result<T> directly.
 */

import type { Result } from '@memoflow/contracts/result';
import { TaskChannels } from '@memoflow/contracts/electron';
import type { ITaskPlanApiClient, IResultIpcClient, TaskPlanListParams } from '../types';
import type {
  TaskPlanClientDTO,
  TaskOccurrenceClientDTO,
  CreateTaskPlanReq,
  CreateTaskPlanRes,
  UpdateTaskPlanReq,
  GenerateInstancesReq,
  BindToGoalReq,
  AbandonTaskPlanReq,
  TaskPlanInstancesQuery,
} from '@memoflow/contracts/task';

export class TaskPlanIpcAdapter implements ITaskPlanApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async createTaskPlan(request: CreateTaskPlanReq): Promise<Result<CreateTaskPlanRes>> {
    return this.ipcClient.invoke(TaskChannels.TEMPLATE_CREATE, request);
  }

  async getTaskPlans(
    params?: TaskPlanListParams,
  ): Promise<Result<{ templates: TaskPlanClientDTO[]; total: number }>> {
    return this.ipcClient.invoke(TaskChannels.TEMPLATE_LIST, params);
  }


  async getTaskPlanById(
    id: string,
    includeChildren = false,
  ): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.TEMPLATE_GET, { id, includeChildren });
  }

  async updateTaskPlan(
    id: string,
    request: UpdateTaskPlanReq,
  ): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.TEMPLATE_UPDATE, { id, request });
  }

  async deleteTaskPlan(id: string): Promise<Result<void>> {
    return this.ipcClient.invoke(TaskChannels.TEMPLATE_DELETE, { id });
  }


  async activateTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.TEMPLATE_ACTIVATE, { id });
  }

  async pauseTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.TEMPLATE_PAUSE, { id });
  }

  async archiveTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.TEMPLATE_ARCHIVE, { id });
  }

  async abandonTaskPlan(id: string, request?: AbandonTaskPlanReq): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.TEMPLATE_ABANDON, { id, request: request ?? {} });
  }

  async generateInstances(
    templateId: string,
    request: GenerateInstancesReq,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return this.ipcClient.invoke(TaskChannels.TEMPLATE_GENERATE_INSTANCES, {
      templateId,
      request,
    });
  }

  async getInstancesByDateRange(
    templateId: string,
    query?: TaskPlanInstancesQuery,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return this.ipcClient.invoke(TaskChannels.TEMPLATE_GET_INSTANCES, {
      templateId,
      ...query,
    });
  }

  async bindToGoal(
    templateId: string,
    request: BindToGoalReq,
  ): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.TEMPLATE_BIND_GOAL, {
      templateId,
      request,
    });
  }

  async unbindFromGoal(templateId: string): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.TEMPLATE_UNBIND_GOAL, { templateId });
  }
}

export function createTaskPlanIpcAdapter(ipcClient: IResultIpcClient): TaskPlanIpcAdapter {
  return new TaskPlanIpcAdapter(ipcClient);
}
