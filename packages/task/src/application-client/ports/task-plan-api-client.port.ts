/**
 * Task Template API Client Port
 *
 * Transport-agnostic interface for Task Template API operations.
 * Implementations: HTTP adapters (web), IPC adapters (desktop)
 */

import type { Result } from '@memoflow/contracts/result';
import type {
  ListTaskPlanFilters,
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

export interface TaskPlanListParams extends Record<string, unknown>, ListTaskPlanFilters {
  page?: number;
  limit?: number;
}

export interface ITaskPlanApiClient {
  createTaskPlan(request: CreateTaskPlanReq): Promise<Result<CreateTaskPlanRes>>;
  getTaskPlans(
    params?: TaskPlanListParams,
  ): Promise<Result<{ templates: TaskPlanClientDTO[]; total: number }>>;
  getTaskPlanById(
    id: string,
    includeChildren?: boolean,
  ): Promise<Result<TaskPlanClientDTO>>;
  updateTaskPlan(
    id: string,
    request: UpdateTaskPlanReq,
  ): Promise<Result<TaskPlanClientDTO>>;
  deleteTaskPlan(id: string): Promise<Result<void>>;
  activateTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>>;
  pauseTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>>;
  archiveTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>>;
  abandonTaskPlan(id: string, request?: AbandonTaskPlanReq): Promise<Result<TaskPlanClientDTO>>;
  generateInstances(
    templateId: string,
    request: GenerateInstancesReq,
  ): Promise<Result<TaskOccurrenceClientDTO[]>>;
  getInstancesByDateRange(
    templateId: string,
    query?: TaskPlanInstancesQuery,
  ): Promise<Result<TaskOccurrenceClientDTO[]>>;
  bindToGoal(templateId: string, request: BindToGoalReq): Promise<Result<TaskPlanClientDTO>>;
  unbindFromGoal(templateId: string): Promise<Result<TaskPlanClientDTO>>;
}
