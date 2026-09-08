import type { TaskGoalBindingTriggerValue } from '@memoflow/contracts/task';
import type { LabelClientDTO } from '@memoflow/contracts/label';

export type UIPriority = 'high' | 'normal' | 'low' | 'urgent';

export interface EditableTaskUI {
  title: string;
  description?: string;
  estimatedHours: number;
  priority: UIPriority;
  dependencies?: number[];
  selected: boolean;
}

export interface TaskTimeRangeViewModel {
  start: number;
  end: number;
}

export interface TaskTimeConfigViewModel {
  timeType?: 'AllDay' | 'TimePoint' | 'TimeRange';
  timePoint?: number | null;
  timeRange?: TaskTimeRangeViewModel | null;
  startDate?: string | Date | number;
}

export interface TaskGoalContributionViewModel {
  value: number;
  trigger: TaskGoalBindingTriggerValue;
}

export interface TaskGoalBindingViewModel {
  goalId?: string;
  keyResultId?: string;
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
  id: string;
  title: string;
  weight?: number;
  progress: GoalBindingProgress;
}

export interface TaskTemplateViewModel {
  id: string;
  title: string;
  description?: string;
  status: string;
  statusText?: string;
  isActive?: boolean;
  isPaused?: boolean;
  isArchived?: boolean;
  importance?: string;
  importanceText?: string;
  estimatedMinutes?: number | null;
  dueDate?: string | number | null;
  recurrenceText?: string;
  labels?: LabelClientDTO[];
  labelIds?: string[];
  goalBinding?: TaskGoalBindingViewModel | null;
  timeConfig: TaskTimeConfigViewModel;
  recurrenceRule?: Record<string, unknown> | null;
  reminderConfig?: Record<string, unknown> | null;
  instanceCount?: number;
  completedInstanceCount?: number;
  pendingInstanceCount?: number;
  dueInstanceCount?: number;
  completedDueInstanceCount?: number;
  completionWindowDays?: 30;
  futurePendingInstanceCount?: number;
  singleInstanceStatus?: 'Pending' | 'InProgress' | 'Completed' | 'Missed' | 'Skipped' | null;
  completionRate?: number;
  formattedCreatedAt?: string;
  /** TaskType enum value mapped for CreateTaskTemplateReq.taskType */
  taskType?: string;
}

export interface TaskTemplateFormProps {
  modelValue?: TaskTemplateViewModel | null;
  isEditMode?: boolean;
  readonly?: boolean;
  goals?: GoalBindingOption[];
  keyResultsByGoal?: Record<string, KeyResultBindingOption[]>;
  loadingGoals?: boolean;
  loadingKeyResults?: Record<string, boolean>;
  keyResultErrorsByGoal?: Record<string, string | null>;
  onRequestKeyResults?: (
    goalId: string,
    force?: boolean,
  ) => Promise<KeyResultBindingOption[] | void> | void;
}

export interface TaskTemplateFormValidationState {
  isValid: boolean;
}

export interface TaskTemplateFormEmits {
  'update:modelValue': [value: TaskTemplateViewModel];
  'update:validation': [validation: TaskTemplateFormValidationState];
  close: [];
}

export interface TaskInstanceViewModel {
  id: string;
  templateId?: string;
  templateTitle?: string;
  isCompleted: boolean;
  statusText?: string;
  instanceDate: string | Date;
  instanceDateFormatted?: string;
  note?: string;
  actualEndTime?: string | Date | null;
  timeConfig: TaskTimeConfigViewModel;
  goalBinding?: TaskGoalBindingViewModel | null;
}

// ── 任务库列表过滤 / 视图模式（UI_PAGE_REDESIGN_PLAN §6）──

export type TaskStatusFilter = 'ALL' | 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'ARCHIVED';

export type TaskViewMode = 'card';
