import type {
  CreateTaskPlanReq,
  TaskPlanClientDTO,
} from "@memoflow/task-contracts";
import type { TaskPlanViewModel } from "./task-view";
import type { OwnerNativeEditSession } from "./owner-session";

export type TaskNativePatch = Partial<
  Pick<
    TaskPlanViewModel,
    | "title"
    | "description"
    | "schedule"
    | "reminderConfig"
    | "importance"
    | "labelIds"
    | "goalBinding"
    | "checklist"
  >
>;
export interface TaskNativeDraftState {
  draft: TaskPlanViewModel;
  dirty: boolean;
  busy: boolean;
}
export interface TaskNativeSubmitContext {
  createId: NonNullable<CreateTaskPlanReq["id"]>;
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
    "title",
    TaskNativeDraftState,
    TaskNativeSubmitContext,
    TaskPlanClientDTO | null
  >,
  "patch" | "focus" | "readDraftState" | "requestSubmit" | "requestCancel"
> & {
  coordinateSubmit(
    submit: () => Promise<void>,
    cancel: () => Promise<void>,
  ): void;
  setEditingBlocked(blocked: boolean): void;
};
