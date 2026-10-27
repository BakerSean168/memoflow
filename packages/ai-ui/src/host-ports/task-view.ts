import type { TaskGoalProgressRule } from '@memoflow/task-contracts';
import type { KeyResultCalculationMethod } from '@memoflow/goal-contracts';
import type {
  ChecklistItemDefinitionDTO,
  TaskGoalBindingTriggerValue,
  TaskPlanClientDTO,
  TaskPlanSchedule,
} from '@memoflow/task-contracts';
import type { LabelClientDTO } from '@memoflow/label-contracts';

export type TaskSurface = 'today' | 'plans';
export type TaskPlanStateFilter =
  | 'all'
  | 'active'
  | 'paused'
  | 'succeeded'
  | 'failed'
  | 'abandoned'
  | 'archived';

export interface TaskGoalContributionViewModel {
  value: number;
  trigger: TaskGoalBindingTriggerValue;
}

export interface TaskGoalBindingViewModel {
  goalId: string;
  keyResultId: string | null;
  progressRule?: TaskGoalProgressRule | null;
  /** @deprecated Input compatibility only. */
  contribution?: TaskGoalContributionViewModel;
}

export interface TaskGoalBindingDisplay {
  goalName: string;
  keyResultName: string;
}

export interface GoalBindingProgress {
  current: number;
  target: number;
  percentage: number;
}

export interface GoalBindingOption {
  id: string;
  title: string;
  description?: string;
  status?: string;
}

export interface KeyResultBindingOption {
  calculationMethod: KeyResultCalculationMethod;
  methodLabel: string;
  recordInputKind: 'delta' | 'sample';
  unit: string | null;
  currentValue: number;
  targetValue: number;
  id: string;
  title: string;
  weight?: number;
  progress: GoalBindingProgress;
}

export interface TaskPlanViewModel {
  id: string;
  title: string;
  description?: string;
  status: string;
  statusText?: string;
  outcome?: TaskPlanClientDTO['outcome'];
  outcomeText?: string;
  stateText?: string;
  isClosed?: boolean;
  isActive?: boolean;
  isPaused?: boolean;
  isArchived?: boolean;
  importance?: string;
  importanceText?: string;
  recurrenceText?: string;
  labels?: LabelClientDTO[];
  labelIds?: string[];
  goalBinding?: TaskGoalBindingViewModel | null;
  checklist: ChecklistItemDefinitionDTO[];
  schedule: TaskPlanSchedule;
  reminderConfig?: Record<string, unknown> | null;
  occurrenceCount?: number;
  completedOccurrenceCount?: number;
  pendingOccurrenceCount?: number;
  dueOccurrenceCount?: number;
  completedDueOccurrenceCount?: number;
  completionWindowDays?: 30;
  futurePendingOccurrenceCount?: number;
  singleOccurrenceStatus?: 'Pending' | 'InProgress' | 'Completed' | 'Missed' | 'Skipped' | null;
  completionRate?: number;
  formattedCreatedAt?: string;
}
