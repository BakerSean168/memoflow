/**
 * Task Plan API Client Port
 *
 * Transport-agnostic interface for Task Plan API operations.
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
  GenerateOccurrencesReq,
  BindToGoalReq,
  AbandonTaskPlanReq,
  TaskPlanOccurrencesQuery,
  GetTaskWorkspaceReq,
  TaskPlanWorkspace,
} from '@memoflow/contracts/task';

export interface TaskPlanListParams extends Record<string, unknown>, ListTaskPlanFilters {
  page?: number;
  limit?: number;
}

export interface ITaskPlanApiClient {
  getWorkspace(planId: string, request?: GetTaskWorkspaceReq): Promise<Result<TaskPlanWorkspace>>;
  createTaskPlan(request: CreateTaskPlanReq): Promise<Result<CreateTaskPlanRes>>;
  getTaskPlans(
    params?: TaskPlanListParams,
  ): Promise<Result<{ plans: TaskPlanClientDTO[]; total: number }>>;
  getTaskPlanById(id: string): Promise<Result<TaskPlanClientDTO>>;
  updateTaskPlan(id: string, request: UpdateTaskPlanReq): Promise<Result<TaskPlanClientDTO>>;
  deleteTaskPlan(id: string): Promise<Result<void>>;
  activateTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>>;
  pauseTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>>;
  archiveTaskPlan(id: string): Promise<Result<TaskPlanClientDTO>>;
  abandonTaskPlan(id: string, request?: AbandonTaskPlanReq): Promise<Result<TaskPlanClientDTO>>;
  generateOccurrences(
    planId: string,
    request: GenerateOccurrencesReq,
  ): Promise<Result<TaskOccurrenceClientDTO[]>>;
  getOccurrencesByDateRange(
    planId: string,
    query?: TaskPlanOccurrencesQuery,
  ): Promise<Result<TaskOccurrenceClientDTO[]>>;
  bindToGoal(planId: string, request: BindToGoalReq): Promise<Result<TaskPlanClientDTO>>;
  unbindFromGoal(planId: string): Promise<Result<TaskPlanClientDTO>>;
}
