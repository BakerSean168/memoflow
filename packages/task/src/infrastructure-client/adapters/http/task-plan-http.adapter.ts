/**
 * Task Plan HTTP Adapter
 *
 * HTTP implementation of ITaskPlanApiClient.
 * Uses IResultHttpClient for making HTTP requests.
 */

import type { Result } from '@memoflow/contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { ITaskPlanApiClient, TaskPlanListParams } from '../types';
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

/**
 * TaskPlanHttpAdapter
 *
 * HTTP implementation of the task plan API client.
 */
export class TaskPlanHttpAdapter implements ITaskPlanApiClient {
  private readonly baseUrl = '/task-plans';

  constructor(private readonly httpClient: IResultHttpClient) {}

  async getWorkspace(planId: string, request?: GetTaskWorkspaceReq): Promise<Result<TaskPlanWorkspace>> {
    return this.httpClient.get(`/tasks/${planId}/workspace`, { params: request });
  }

  // ===== Task Plan CRUD =====

  async createTaskPlan(request: CreateTaskPlanReq): Promise<Result<CreateTaskPlanRes>> {
    return this.httpClient.post(this.baseUrl, request);
  }

  async getTaskPlans(
    params?: TaskPlanListParams,
  ): Promise<Result<{ plans: TaskPlanClientDTO[]; total: number }>> {
    return this.httpClient.get(this.baseUrl, { params });
  }

  async getTaskPlanById(id: string): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.get(`${this.baseUrl}/${id}`);
  }

  async updateTaskPlan(id: string, request: UpdateTaskPlanReq): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.patch(`${this.baseUrl}/${id}`, request);
  }

  async deleteTaskPlan(id: string): Promise<Result<void>> {
    return this.httpClient.delete(`${this.baseUrl}/${id}`);
  }

  // ===== Special Query Methods =====

  // ===== Task Plan State Management =====

  async activateTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/activate`);
  }

  async pauseTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/pause`);
  }

  async archiveTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/archive`);
  }

  async abandonTaskPlan(
    id: string,
    request?: AbandonTaskPlanReq,
  ): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/abandon`, request ?? {});
  }

  // ===== Aggregate Control: Occurrence Management =====

  async generateOccurrences(
    planId: string,
    request: GenerateOccurrencesReq,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return this.httpClient.post(`${this.baseUrl}/${planId}/generate-occurrences`, request);
  }

  async getOccurrencesByDateRange(
    planId: string,
    query?: TaskPlanOccurrencesQuery,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return this.httpClient.get(`${this.baseUrl}/${planId}/occurrences`, {
      params: query,
    });
  }

  // ===== Aggregate Control: Goal Binding Management =====

  async bindToGoal(planId: string, request: BindToGoalReq): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${planId}/bind-goal`, request);
  }

  async unbindFromGoal(planId: string): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${planId}/unbind-goal`);
  }
}

/**
 * Factory function to create TaskPlanHttpAdapter
 */
export function createTaskPlanHttpAdapter(httpClient: IResultHttpClient): TaskPlanHttpAdapter {
  return new TaskPlanHttpAdapter(httpClient);
}
