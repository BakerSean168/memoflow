import type { CreateTaskPlanReq, TaskPlanClientDTO } from '@memoflow/task-contracts';
import type { OwnerNativeEditSession } from './owner-native-edit-session';

/**
 * Fields an owner-native Task draft may patch.
 */
export type TaskNativePatchField =
  | 'title'
  | 'description'
  | 'schedule'
  | 'reminderConfig'
  | 'importance'
  | 'labelIds'
  | 'goalBinding'
  | 'checklist';

/**
 * Patch accepted by the Task native session; the draft is the owner's own view
 * model, so every renderer instantiates the protocol with its draft type.
 *
 * @typeParam Draft - Draft view model exposed by the owner session
 */
export type TaskNativePatch<Draft> = Partial<
  Pick<Draft, Extract<keyof Draft, TaskNativePatchField>>
>;

/**
 * Snapshot returned by `readDraftState`.
 *
 * @typeParam Draft - Draft view model exposed by the owner session
 */
export interface TaskNativeDraftState<Draft> {
  draft: Draft;
  dirty: boolean;
  busy: boolean;
}

/**
 * Fence used by workflow-driven owner submissions.
 *
 * @typeParam Draft - Draft view model exposed by the owner session
 */
export interface TaskNativeSubmitContext<Draft> {
  createId: NonNullable<CreateTaskPlanReq['id']>;
  pendingLabelNames: string[];
  expectedDraft: Draft;
  onCreateAttempt: () => void;
}

/**
 * Full-create only: unsupported existing/list operations are not exposed.
 *
 * @typeParam Draft - Draft view model exposed by the owner session
 */
export type TaskNativeEditSession<Draft> = Pick<
  OwnerNativeEditSession<
    TaskNativePatch<Draft>,
    never,
    never,
    'title',
    TaskNativeDraftState<Draft>,
    TaskNativeSubmitContext<Draft>,
    TaskPlanClientDTO | null
  >,
  'patch' | 'focus' | 'readDraftState' | 'requestSubmit' | 'requestCancel'
> & {
  coordinateSubmit(submit: () => Promise<void>, cancel: () => Promise<void>): void;
  setEditingBlocked(blocked: boolean): void;
};
