import type {
  CreateGoalReq,
  GoalClientDTO,
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
  keyResults?: GoalDraftKeyResult[];
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
  GoalDraftKeyResult,
  number,
  GoalNativeField,
  GoalNativeDraftState,
  GoalNativeSubmitContext,
  GoalClientDTO | null
> & {
  /** Native Save/Enter delegates to this coordinator; semantic submit still runs owner validation. */
  setEditingBlocked(blocked: boolean): void;
  coordinateSubmit(coordinator: () => Promise<void>): void;
};

export interface GoalNativeSubmitContext {
  /** Called after validation/label resolution, immediately before owner persistence. */
  onCreateAttempt?: () => void;
  createId: NonNullable<CreateGoalReq['id']>;
  keyResultIds: NonNullable<NonNullable<CreateGoalReq['initialKeyResults']>[number]['id']>[];
  pendingLabelNames: string[];
  /** Refuse submission if the user changed the native draft while its durable revision was saved. */
  expectedDraft: GoalNativeDraft;
}
