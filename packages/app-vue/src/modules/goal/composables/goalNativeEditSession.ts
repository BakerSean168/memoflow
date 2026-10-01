import type {
  GoalReminderConfigDTO,
  GoalStatus,
  GoalTimeframe,
  UpdateGoalReq,
} from '@memoflow/contracts/goal';
import type { OwnerNativeEditSession } from '../../../shared/composables/ownerNativeEditSession';

export type GoalDraftKeyResult = NonNullable<UpdateGoalReq['keyResults']>[number];
export interface GoalNativeDraft {
  name: string;
  summary: string;
  description: string;
  status: GoalStatus;
  start: GoalTimeframe | null;
  target: GoalTimeframe | null;
  reminderConfig: GoalReminderConfigDTO | null;
  labelIds: string[];
  keyResults: GoalDraftKeyResult[];
}

/** Child positions refer to the current snapshot, just like the native KR rows. */
export type GoalNativePatch = Partial<Omit<GoalNativeDraft, 'keyResults'>> & {
  keyResult?: { index: number; changes: Partial<Omit<GoalDraftKeyResult, 'id'>> };
};
export type GoalNativeField = 'name' | 'summary' | 'description';
export interface GoalNativeDraftState {
  mode: 'create' | 'edit';
  goalId: string | null;
  draft: GoalNativeDraft;
  dirty: boolean;
  busy: boolean;
  error: string | null;
}
export type GoalNativeEditSession = OwnerNativeEditSession<
  GoalNativePatch,
  Omit<GoalDraftKeyResult, 'id'>,
  number,
  GoalNativeField,
  GoalNativeDraftState
>;
