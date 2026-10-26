import type  {
  CreateGoalReq,
  GoalClientDTO,
  GoalNativeAiLease,
  GoalNativeDraftDTO,
} from '@memoflow/goal-contracts';
import type { OwnerNativeEditSession } from '../../../shared/composables/ownerNativeEditSession';

export type GoalNativeDraft = GoalNativeDraftDTO;
export type GoalDraftKeyResult = GoalNativeDraft['keyResults'][number];

/** Child positions refer to the current snapshot, just like the native KR rows. */
export type GoalNativePatch = Partial<Omit<GoalNativeDraft, 'keyResults'>> & {
  keyResults?: GoalDraftKeyResult[];
  keyResult?: { index: number; changes: Partial<Omit<GoalDraftKeyResult, 'id'>> };
};
export type GoalNativeField = 'name' | 'summary' | 'description';
export interface GoalNativeDraftState {
  revision: number;
  restoredWorkflowRunId?: string;
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
  /** Claim atomically; only the returned capability may mutate until released. */
  claimControl(ownerId: string): GoalNativeEditSession;
  /** Releases this handle's control without closing or discarding the native draft. */
  releaseControl(): void;
  /** Detach a terminated workflow's control and callbacks, preserving the native draft. */
  detachWorkflow(): void;
  /** Native Save/Enter and user dismissal delegate to workflow coordinators; semantic owner validation remains native. */
  setEditingBlocked(blocked: boolean): void;
  coordinateSubmit(submit: () => Promise<void>, cancel: () => Promise<void>): void;
};

export interface GoalNativeSubmitContext {
  /** Authenticated Goal owner Save MUST verify this fence in the write tx. */
  nativeAiLease: GoalNativeAiLease;
  /** Called after validation/label resolution, immediately before owner persistence. */
  onCreateAttempt?: () => void;
  createId: NonNullable<CreateGoalReq['id']>;
  keyResultIds: NonNullable<NonNullable<CreateGoalReq['initialKeyResults']>[number]['id']>[];
  pendingLabelNames: string[];
  /** Refuse submission if the user changed the native draft while its durable revision was saved. */
  expectedDraft: GoalNativeDraft;
}
