import type { TaskGoalProgressRule, TaskPlanClientDTO } from '@memoflow/task-contracts';

/** Goal binding as the native Task draft exposes it: plain ids, no display fields. */
export interface TaskPlanGoalBinding {
  goalId: string;
  keyResultId: string | null;
  progressRule?: TaskGoalProgressRule | null;
}

/**
 * AI-owned projection of the Task plan draft.
 *
 * Shared fields are picked from the Task client DTO; the remaining fields are
 * the draft-facing display fields the AI review surfaces read and patch. This
 * replaces the verbatim copy of Task UI's component view model.
 */
export interface TaskPlanView extends Pick<TaskPlanClientDTO, 'schedule' | 'checklist'> {
  title: string;
  description?: string;
  importance?: string;
  labelIds?: string[];
  reminderConfig?: Record<string, unknown> | null;
  goalBinding?: TaskPlanGoalBinding | null;
}
