/**
 * Task Template IPC Adapter
 *
 * IPC implementation of ITaskPlanApiClient for Electron desktop.
 * Uses ResultIpcClient — all methods return Result<T> directly.
 */

import type { Result } from '@memoflow/contracts/result';
import { TaskChannels, TaskWorkspaceChannels } from '@memoflow/contracts/electron';
import type { ITaskPlanApiClient, IResultIpcClient, TaskPlanListParams } from '../types';
import type {
  TaskPlanClientDTO,
  TaskOccurrenceClientDTO,
  CreateTaskPlanReq,
  CreateTaskPlanRes,
  UpdateTaskPlanReq,
  GenerateOccurrencesReq,
  BindToGoalReq,
  AbandonTaskPlanReq,
  TaskPlanOccurrencesQuery,
  GetTaskWorkspaceReq,
  TaskPlanWorkspace,
} from '@memoflow/contracts/task';

export class TaskPlanIpcAdapter implements ITaskPlanApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async getWorkspace(planId: string, request?: GetTaskWorkspaceReq): Promise<Result<TaskPlanWorkspace>> {
    return this.ipcClient.invoke(TaskWorkspaceChannels.GET, { planId, ...request });
  }

  async createTaskPlan(request: CreateTaskPlanReq): Promise<Result<CreateTaskPlanRes>> {
    return this.ipcClient.invoke(TaskChannels.PLAN_CREATE, request);
  }

  async getTaskPlans(
    params?: TaskPlanListParams,
  ): Promise<Result<{ plans: TaskPlanClientDTO[]; total: number }>> {
    return this.ipcClient.invoke(TaskChannels.PLAN_LIST, params);
  }

  async getTaskPlanById(id: string): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.PLAN_GET, { id });
  }

  async updateTaskPlan(id: string, request: UpdateTaskPlanReq): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.PLAN_UPDATE, { id, request });
  }

  async deleteTaskPlan(id: string): Promise<Result<void>> {
    return this.ipcClient.invoke(TaskChannels.PLAN_DELETE, { id });
  }

  async activateTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.PLAN_ACTIVATE, { id });
  }

  async pauseTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.PLAN_PAUSE, { id });
  }

  async archiveTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.PLAN_ARCHIVE, { id });
  }

  async abandonTaskPlan(
    id: string,
    request?: AbandonTaskPlanReq,
  ): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.PLAN_ABANDON, { id, request: request ?? {} });
  }

  async generateOccurrences(
    planId: string,
    request: GenerateOccurrencesReq,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return this.ipcClient.invoke(TaskChannels.PLAN_GENERATE_OCCURRENCES, {
      planId,
      request,
    });
  }

  async getOccurrencesByDateRange(
    planId: string,
    query?: TaskPlanOccurrencesQuery,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return this.ipcClient.invoke(TaskChannels.PLAN_GET_OCCURRENCES, {
      planId,
      ...query,
    });
  }

  async bindToGoal(planId: string, request: BindToGoalReq): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.PLAN_BIND_GOAL, {
      planId,
      request,
    });
  }

  async unbindFromGoal(planId: string): Promise<Result<TaskPlanClientDTO>> {
    return this.ipcClient.invoke(TaskChannels.PLAN_UNBIND_GOAL, { planId });
  }
}

export function createTaskPlanIpcAdapter(ipcClient: IResultIpcClient): TaskPlanIpcAdapter {
  return new TaskPlanIpcAdapter(ipcClient);
}
