import type {
  CreateTaskPlanReq,
  CreateTaskPlanRes,
  GetTaskPlanReq,
  GetTaskPlanRes,
  ListTaskPlanFilters,
  QueryTaskPlansRes,
  RescheduleTaskReq,
  RescheduleTaskRes,
} from '../api';
import type {
  AbandonTaskPlanInvocation,
  BindTaskToGoalInvocation,
  CompleteTaskOccurrenceInvocation,
  GenerateOccurrencesInvocation,
  MarkTaskOccurrenceMissedInvocation,
  SetTaskOccurrenceChecklistItemInvocation,
  SkipTaskOccurrenceInvocation,
  TaskOccurrenceIdCommandInvocation,
  TaskPlanIdCommandInvocation,
  UpdateTaskPlanInvocation,
} from '../api/task-invocation.schemas';
import type {
  GetTaskOccurrencesByRangeReq,
  GetTaskOccurrencesByRangeRes,
} from '../api/task-occurrence.dto';
import type { TaskOccurrenceResponse, TaskPlanResponse } from '../api/response-schemas';

export type TaskRpcMap = {
  'task:plan:create': [CreateTaskPlanReq, CreateTaskPlanRes];
  'task:plan:update': [UpdateTaskPlanInvocation, TaskPlanResponse];
  'task:plan:delete': [TaskPlanIdCommandInvocation, null];
  'task:plan:activate': [TaskPlanIdCommandInvocation, TaskPlanResponse];
  'task:plan:abandon': [AbandonTaskPlanInvocation, TaskPlanResponse];
  'task:plan:pause': [TaskPlanIdCommandInvocation, TaskPlanResponse];
  'task:plan:archive': [TaskPlanIdCommandInvocation, TaskPlanResponse];
  'task:plan:generate-occurrences': [GenerateOccurrencesInvocation, TaskOccurrenceResponse[]];
  'task:plan:bind-goal': [BindTaskToGoalInvocation, TaskPlanResponse];
  'task:plan:unbind-goal': [TaskPlanIdCommandInvocation, TaskPlanResponse];
  'task:plan:get': [GetTaskPlanReq, GetTaskPlanRes];
  'task:plan:list': [ListTaskPlanFilters, QueryTaskPlansRes];

  'task:occurrence:create': [TaskOccurrenceIdCommandInvocation, TaskOccurrenceResponse];
  'task:occurrence:delete': [TaskOccurrenceIdCommandInvocation, null];
  'task:occurrence:complete': [CompleteTaskOccurrenceInvocation, TaskOccurrenceResponse];
  'task:occurrence:uncomplete': [TaskOccurrenceIdCommandInvocation, TaskOccurrenceResponse];
  'task:occurrence:skip': [SkipTaskOccurrenceInvocation, TaskOccurrenceResponse];
  'task:occurrence:mark-missed': [MarkTaskOccurrenceMissedInvocation, TaskOccurrenceResponse];
  'task:occurrence:checklist-set': [SetTaskOccurrenceChecklistItemInvocation, TaskOccurrenceResponse];
  'task:occurrence:get-by-date-range': [GetTaskOccurrencesByRangeReq, GetTaskOccurrencesByRangeRes];

  'task:reschedule-occurrence': [RescheduleTaskReq, RescheduleTaskRes];
};
