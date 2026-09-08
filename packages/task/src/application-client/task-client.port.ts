import type { Result } from '@memoflow/contracts/result';
import type {
  CreateTaskPlanReq,
  UpdateTaskPlanReq,
  GenerateInstancesReq,
  BindToGoalReq,
  AbandonTaskPlanReq,
  CompleteTaskOccurrenceReq,
  MarkTaskOccurrenceMissedReq,
  SkipTaskOccurrenceReq,
  RescheduleTaskInput,
} from '@memoflow/contracts/task';
import type { TaskPlanListParams } from './ports/task-plan-api-client.port';
import type { TaskPlan } from '../domain-client/aggregates/task-plan';
import type { TaskOccurrence } from '../domain-client/aggregates/task-occurrence';

export interface TaskClientPort {
  // Task Template Operations
  createTemplate(
    request: CreateTaskPlanReq,
  ): Promise<
    Result<{ template: TaskPlan; instanceCount: number; todayInstanceCreated: boolean }>
  >;
  listTemplates(
    params?: TaskPlanListParams,
  ): Promise<Result<{ templates: TaskPlan[]; total: number }>>;
  getTemplate(id: string): Promise<Result<TaskPlan>>;
  updateTemplate(id: string, request: UpdateTaskPlanReq): Promise<Result<TaskPlan>>;
  deleteTemplate(id: string): Promise<Result<void>>;
  activateTemplate(id: string): Promise<Result<TaskPlan>>;
  pauseTemplate(id: string): Promise<Result<TaskPlan>>;
  archiveTemplate(id: string): Promise<Result<TaskPlan>>;
  abandonPlan(id: string, request?: AbandonTaskPlanReq): Promise<Result<TaskPlan>>;
  generateInstances(
    templateId: string,
    request: GenerateInstancesReq,
  ): Promise<Result<TaskOccurrence[]>>;
  getInstancesByDateRange(
    templateId: string,
    from: number,
    to: number,
  ): Promise<Result<TaskOccurrence[]>>;
  bindToGoal(templateId: string, request: BindToGoalReq): Promise<Result<TaskPlan>>;
  unbindFromGoal(templateId: string): Promise<Result<TaskPlan>>;

  // Task Instance Operations
  listInstances(params?: {
    page?: number;
    limit?: number;
    templateId?: string;
    status?: string;
  }): Promise<Result<TaskOccurrence[]>>;
  listInstancesByDateRange(from: number, to: number): Promise<Result<TaskOccurrence[]>>;
  getInstance(id: string): Promise<Result<TaskOccurrence>>;
  deleteInstance(id: string): Promise<Result<void>>;
  startInstance(id: string): Promise<Result<TaskOccurrence>>;
  completeInstance(id: string, request?: CompleteTaskOccurrenceReq): Promise<Result<TaskOccurrence>>;
  uncompleteInstance(id: string): Promise<Result<TaskOccurrence>>;
  skipInstance(id: string, request?: SkipTaskOccurrenceReq): Promise<Result<TaskOccurrence>>;
  markInstanceMissed(
    id: string,
    request?: MarkTaskOccurrenceMissedReq,
  ): Promise<Result<TaskOccurrence>>;
  rescheduleInstance(id: string, request: RescheduleTaskInput): Promise<Result<TaskOccurrence>>;
}
