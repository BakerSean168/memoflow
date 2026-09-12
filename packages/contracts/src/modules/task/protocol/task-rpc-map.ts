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
  GenerateInstancesInvocation,
  MarkTaskOccurrenceMissedInvocation,
  SkipTaskOccurrenceInvocation,
  TaskOccurrenceIdCommandInvocation,
  TaskPlanIdCommandInvocation,
  UpdateTaskPlanInvocation,
} from '../api/task-invocation.schemas';
import type { GetTaskOccurrencesByRangeReq, GetTaskOccurrencesByRangeRes } from '../api/task-occurrence.dto';
import type {
  TaskOccurrenceResponse,
  TaskPlanResponse,
} from '../api/response-schemas';

export type TaskRpcMap = {
  'task:template:create': [CreateTaskPlanReq, CreateTaskPlanRes];
  'task:template:update': [UpdateTaskPlanInvocation, TaskPlanResponse];
  'task:template:delete': [TaskPlanIdCommandInvocation, null];
  'task:template:activate': [TaskPlanIdCommandInvocation, TaskPlanResponse];
  'task:template:abandon': [AbandonTaskPlanInvocation, TaskPlanResponse];
  'task:template:pause': [TaskPlanIdCommandInvocation, TaskPlanResponse];
  'task:template:archive': [TaskPlanIdCommandInvocation, TaskPlanResponse];
  'task:template:generate-instances': [GenerateInstancesInvocation, TaskOccurrenceResponse[]];
  'task:template:bind-goal': [BindTaskToGoalInvocation, TaskPlanResponse];
  'task:template:unbind-goal': [TaskPlanIdCommandInvocation, TaskPlanResponse];
  'task:template:get': [GetTaskPlanReq, GetTaskPlanRes];
  'task:template:list': [ListTaskPlanFilters, QueryTaskPlansRes];

  'task:instance:create': [TaskOccurrenceIdCommandInvocation, TaskOccurrenceResponse];
  'task:instance:delete': [TaskOccurrenceIdCommandInvocation, null];
  'task:instance:complete': [CompleteTaskOccurrenceInvocation, TaskOccurrenceResponse];
  'task:instance:uncomplete': [TaskOccurrenceIdCommandInvocation, TaskOccurrenceResponse];
  'task:instance:skip': [SkipTaskOccurrenceInvocation, TaskOccurrenceResponse];
  'task:instance:mark-missed': [MarkTaskOccurrenceMissedInvocation, TaskOccurrenceResponse];
  'task:instance:get-by-date-range': [GetTaskOccurrencesByRangeReq, GetTaskOccurrencesByRangeRes];


  'task:reschedule-instance': [RescheduleTaskReq, RescheduleTaskRes];
};
