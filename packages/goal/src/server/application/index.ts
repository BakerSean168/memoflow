/**
 * Goal Application Module (Server)
 *
 * Provides services for goal management on the server side.
 * Each service orchestrates domain objects and repositories.
 *
 * 类型定义请从 @memoflow/contracts/goal 导入
 */

// ============================================================
// Services (按用例划分)
// ============================================================
export {
  // Goal Services
  CreateGoalUseCase,
  GetGoalUseCase,
  ListGoalsUseCase,
  UpdateGoalUseCase,
  DeleteGoalUseCase,
  ArchiveGoalUseCase,
  ActivateGoalUseCase,
  PlanGoalUseCase,
  AbandonGoalUseCase,
  CompleteGoalUseCase,
  PermanentlyDeleteGoalUseCase,
  SearchGoalsUseCase,
  // Key Result Services
  AddGoalKeyResultUseCase,
  UpdateGoalKeyResultUseCase,
  UpdateGoalKeyResultProgressUseCase,
  DeleteGoalKeyResultUseCase,
  // Review Services
  AddGoalReviewUseCase,
  ListGoalReviewsUseCase,
  GetGoalReviewContextUseCase,
  UpdateGoalReviewUseCase,
  DeleteGoalReviewUseCase,
  // Record Services
  CreateGoalRecordUseCase,
  UpdateGoalRecordUseCase,
  ListGoalRecordsUseCase,
  DeleteGoalRecordUseCase,
  // Workflow Services
  GetGoalAggregateUseCase,
  CloneGoalUseCase,
  BatchUpdateKeyResultWeightsUseCase,
} from './use-cases';

// ============================================================
// Mappers
// ============================================================
export { GoalMapper } from './mappers';

// ============================================================
// Event Handlers
// ============================================================
export {
  GoalTaskProgressHandler,
  createGoalTaskProgressHandler,
  registerGoalEventListeners,
  type TaskGoalProgressHandler,
} from './event-handlers';

// ============================================================
// Errors
// ============================================================
export * from './errors/weight-snapshot-errors';

export type { GoalApplicationPort } from './goal.application.port';

export { GoalReviewContextBuilder } from './services/goal-review-context-builder';
