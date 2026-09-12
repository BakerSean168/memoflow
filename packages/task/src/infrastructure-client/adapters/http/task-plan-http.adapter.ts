/**
 * Task Template HTTP Adapter
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
  GenerateInstancesReq,
  BindToGoalReq,
  AbandonTaskPlanReq,
  TaskPlanInstancesQuery,
} from '@memoflow/contracts/task';

/**
 * TaskPlanHttpAdapter
 *
 * HTTP implementation of the task template API client.
 */
export class TaskPlanHttpAdapter implements ITaskPlanApiClient {
  private readonly baseUrl = '/task-plans';

  constructor(private readonly httpClient: IResultHttpClient) {}

  // ===== Task Template CRUD =====

  async createTaskPlan(request: CreateTaskPlanReq): Promise<Result<CreateTaskPlanRes>> {
    return this.httpClient.post(this.baseUrl, request);
  }

  async getTaskPlans(
    params?: TaskPlanListParams,
  ): Promise<Result<{ templates: TaskPlanClientDTO[]; total: number }>> {
    return this.httpClient.get(this.baseUrl, { params });
  }


  async getTaskPlanById(
    id: string,
    includeChildren = false,
  ): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.get(`${this.baseUrl}/${id}`, {
      params: { includeChildren },
    });
  }

  async updateTaskPlan(
    id: string,
    request: UpdateTaskPlanReq,
  ): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.patch(`${this.baseUrl}/${id}`, request);
  }

  async deleteTaskPlan(id: string): Promise<Result<void>> {
    return this.httpClient.delete(`${this.baseUrl}/${id}`);
  }

  // ===== Special Query Methods =====


  // ===== Task Template State Management =====

  async activateTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/activate`);
  }

  async pauseTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/pause`);
  }

  async archiveTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/archive`);
  }

  async abandonTaskPlan(id: string, request?: AbandonTaskPlanReq): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/abandon`, request ?? {});
  }

  // ===== Aggregate Control: Instance Management =====

  async generateInstances(
    templateId: string,
    request: GenerateInstancesReq,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return this.httpClient.post(`${this.baseUrl}/${templateId}/generate-instances`, request);
  }

  async getInstancesByDateRange(
    templateId: string,
    query?: TaskPlanInstancesQuery,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    return this.httpClient.get(`${this.baseUrl}/${templateId}/instances`, {
      params: query,
    });
  }

  // ===== Aggregate Control: Goal Binding Management =====

  async bindToGoal(
    templateId: string,
    request: BindToGoalReq,
  ): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${templateId}/bind-goal`, request);
  }

  async unbindFromGoal(templateId: string): Promise<Result<TaskPlanClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/${templateId}/unbind-goal`);
  }
}

/**
 * Factory function to create TaskPlanHttpAdapter
 */
export function createTaskPlanHttpAdapter(
  httpClient: IResultHttpClient,
): TaskPlanHttpAdapter {
  return new TaskPlanHttpAdapter(httpClient);
}
