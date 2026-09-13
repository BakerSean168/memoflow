import type { Result } from '@memoflow/contracts/result';
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
  GetTaskWorkspaceReq,
  TaskPlanWorkspace,
} from '@memoflow/contracts/task';
import type { TaskPlanListParams } from './ports/task-plan-api-client.port';
import type { TaskPlan } from '../domain-client/aggregates/task-plan';
import type { TaskOccurrence } from '../domain-client/aggregates/task-occurrence';

export interface TaskClientPort {
  getWorkspace(id: string, request?: GetTaskWorkspaceReq): Promise<Result<TaskPlanWorkspace>>;
  // Task Plan Operations
  createPlan(
    request: CreateTaskPlanReq,
  ): Promise<Result<{ plan: TaskPlan; occurrenceCount: number; todayOccurrenceCreated: boolean }>>;
  listPlans(
    params?: TaskPlanListParams,
  ): Promise<Result<{ plans: TaskPlan[]; total: number }>>;
  getPlan(id: string): Promise<Result<TaskPlan>>;
  updatePlan(id: string, request: UpdateTaskPlanReq): Promise<Result<TaskPlan>>;
  deletePlan(id: string): Promise<Result<void>>;
  activatePlan(id: string): Promise<Result<TaskPlan>>;
  pausePlan(id: string): Promise<Result<TaskPlan>>;
  archivePlan(id: string): Promise<Result<TaskPlan>>;
  abandonPlan(id: string, request?: AbandonTaskPlanReq): Promise<Result<TaskPlan>>;
  generateOccurrences(
    planId: string,
    request: GenerateOccurrencesReq,
  ): Promise<Result<TaskOccurrence[]>>;
  getOccurrencesByDateRange(
    planId: string,
    from: number,
    to: number,
  ): Promise<Result<TaskOccurrence[]>>;
  bindToGoal(planId: string, request: BindToGoalReq): Promise<Result<TaskPlan>>;
  unbindFromGoal(planId: string): Promise<Result<TaskPlan>>;

  // Task Occurrence Operations
  listOccurrences(params?: {
    page?: number;
    limit?: number;
    planId?: string;
    status?: string;
  }): Promise<Result<TaskOccurrence[]>>;
  listOccurrencesByDateRange(from: number, to: number): Promise<Result<TaskOccurrence[]>>;
  getOccurrence(id: string): Promise<Result<TaskOccurrence>>;
  deleteOccurrence(id: string): Promise<Result<void>>;
  startOccurrence(id: string): Promise<Result<TaskOccurrence>>;
  completeOccurrence(
    id: string,
    request?: CompleteTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrence>>;
  uncompleteOccurrence(id: string): Promise<Result<TaskOccurrence>>;
  skipOccurrence(id: string, request?: SkipTaskOccurrenceReq): Promise<Result<TaskOccurrence>>;
  markOccurrenceMissed(
    id: string,
    request?: MarkTaskOccurrenceMissedReq,
  ): Promise<Result<TaskOccurrence>>;
  rescheduleOccurrence(id: string, request: RescheduleTaskInput): Promise<Result<TaskOccurrence>>;
  setOccurrenceChecklistItem(
    id: string,
    request: SetTaskOccurrenceChecklistItemReq,
  ): Promise<Result<TaskOccurrence>>;
}
