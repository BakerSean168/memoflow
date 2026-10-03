import type { CreateTaskPlanReq, TaskPlanClientDTO } from '@memoflow/contracts/task';
import type { OwnerNativeEditSession } from '../../../shared/composables/ownerNativeEditSession';
import type { TaskPlanViewModel } from '../components/types';

export type TaskNativePatch = Partial<
  Pick<
    TaskPlanViewModel,
    | 'title'
    | 'description'
    | 'schedule'
    | 'reminderConfig'
    | 'importance'
    | 'labelIds'
    | 'goalBinding'
    | 'checklist'
  >
>;
export interface TaskNativeDraftState {
  draft: TaskPlanViewModel;
  dirty: boolean;
  busy: boolean;
}
export interface TaskNativeSubmitContext {
  createId: NonNullable<CreateTaskPlanReq['id']>;
  pendingLabelNames: string[];
  expectedDraft: TaskPlanViewModel;
  onCreateAttempt: () => void;
}
/** Full-create only: unsupported existing/list operations are not exposed. */
export type TaskNativeEditSession = Pick<
  OwnerNativeEditSession<
    TaskNativePatch,
    never,
    never,
    'title',
    TaskNativeDraftState,
    TaskNativeSubmitContext,
    TaskPlanClientDTO | null
  >,
  'patch' | 'focus' | 'readDraftState' | 'requestSubmit' | 'requestCancel'
> & {
  coordinateSubmit(submit: () => Promise<void>, cancel: () => Promise<void>): void;
  setEditingBlocked(blocked: boolean): void;
};
