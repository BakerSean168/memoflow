/**
 * @memoflow/ai/adapters
 *
 * Canonical AI host adapters shared by the API and Desktop composition roots.
 * Each factory accepts a structural capability object owned by the host, so AI
 * never imports another feature module's server package.
 */

export {
  createGoalPlanMutationAdapter,
  type GoalPlanMutationAdapterDeps,
} from './goal-plan-mutation.adapter';
export {
  createNotificationReadAdapter,
  type NotificationReadAdapterDeps,
} from './notification-read.adapter';
export { createPlannerReadAdapter, type PlannerReadAdapterDeps } from './planner-read.adapter';
export {
  createRoutineCommandAdapter,
  type RoutineCommandAdapterDeps,
  type RoutineTriggerCanonicalizers,
} from './routine-command.adapter';
export {
  createSelectedEntityContextReadAdapter,
  type SelectedEntityContextReadAdapterDeps,
} from './selected-entity-context-read.adapter';
export {
  createTaskPlanMutationAdapter,
  type TaskPlanMutationAdapterDeps,
} from './task-plan-mutation.adapter';
