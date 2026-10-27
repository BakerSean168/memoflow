import type { Result } from '@memoflow/transport-contracts/result';
import type {
  CreateTaskPlanReq,
  UpdateTaskPlanReq,
  GenerateOccurrencesReq,
  BindToGoalReq,
  AbandonTaskPlanReq,
  CompleteTaskOccurrenceReq,
  MarkTaskOccurrenceMissedReq,
  SkipTaskOccurrenceReq,
  RescheduleTaskInput,
  SetTaskOccurrenceChecklistItemReq,
  TaskOccurrenceClientDTO,
  TaskPlanClientDTO,
} from '@memoflow/task-contracts';
import type { GetTaskWorkspaceReq, TaskPlanWorkspace } from '@memoflow/workspace-contracts';
import type { TaskPlanListParams } from './ports/task-plan-api-client.port';

export interface TaskClientPort {
  getWorkspace(id: string, request?: GetTaskWorkspaceReq): Promise<Result<TaskPlanWorkspace>>;
  // Task Plan Operations
  createPlan(
    request: CreateTaskPlanReq,
  ): Promise<
    Result<{ plan: TaskPlanClientDTO; occurrenceCount: number; todayOccurrenceCreated: boolean }>
  >;
  listPlans(
    params?: TaskPlanListParams,
  ): Promise<Result<{ plans: TaskPlanClientDTO[]; total: number }>>;
  getPlan(id: string): Promise<Result<TaskPlanClientDTO>>;
  updatePlan(id: string, request: UpdateTaskPlanReq): Promise<Result<TaskPlanClientDTO>>;
  deletePlan(id: string): Promise<Result<void>>;
  activatePlan(id: string): Promise<Result<TaskPlanClientDTO>>;
  pausePlan(id: string): Promise<Result<TaskPlanClientDTO>>;
  archivePlan(id: string): Promise<Result<TaskPlanClientDTO>>;
  abandonPlan(id: string, request?: AbandonTaskPlanReq): Promise<Result<TaskPlanClientDTO>>;
  generateOccurrences(
    planId: string,
    request: GenerateOccurrencesReq,
  ): Promise<Result<TaskOccurrenceClientDTO[]>>;
  getOccurrencesByDateRange(
    planId: string,
    from: number,
    to: number,
  ): Promise<Result<TaskOccurrenceClientDTO[]>>;
  bindToGoal(planId: string, request: BindToGoalReq): Promise<Result<TaskPlanClientDTO>>;
  unbindFromGoal(planId: string): Promise<Result<TaskPlanClientDTO>>;

  // Task Occurrence Operations
  listOccurrences(params?: {
    page?: number;
    limit?: number;
    planId?: string;
    status?: string;
  }): Promise<Result<TaskOccurrenceClientDTO[]>>;
  listOccurrencesByDateRange(
    from: number,
    to: number,
    options?: { includeOverdueOpen?: boolean },
  ): Promise<Result<TaskOccurrenceClientDTO[]>>;
  getOccurrence(id: string): Promise<Result<TaskOccurrenceClientDTO>>;
  deleteOccurrence(id: string): Promise<Result<void>>;
  startOccurrence(id: string): Promise<Result<TaskOccurrenceClientDTO>>;
  completeOccurrence(
    id: string,
    request?: CompleteTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrenceClientDTO>>;
  uncompleteOccurrence(id: string): Promise<Result<TaskOccurrenceClientDTO>>;
  skipOccurrence(
    id: string,
    request?: SkipTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrenceClientDTO>>;
  markOccurrenceMissed(
    id: string,
    request?: MarkTaskOccurrenceMissedReq,
  ): Promise<Result<TaskOccurrenceClientDTO>>;
  rescheduleOccurrence(
    id: string,
    request: RescheduleTaskInput,
  ): Promise<Result<TaskOccurrenceClientDTO>>;
  setOccurrenceChecklistItem(
    id: string,
    request: SetTaskOccurrenceChecklistItemReq,
  ): Promise<Result<TaskOccurrenceClientDTO>>;
}
