import type { TaskPlanViewModel } from '../components/types';
import type {
  TaskNativeDraftState as ClientTaskNativeDraftState,
  TaskNativeEditSession as ClientTaskNativeEditSession,
  TaskNativePatch as ClientTaskNativePatch,
  TaskNativeSubmitContext as ClientTaskNativeSubmitContext,
} from '@memoflow/task-client';

/**
 * Task view-model instantiation of the client-owned native editing protocol.
 *
 * The protocol lives in `@memoflow/task-client`; the draft is Task's own view
 * model, so this module only binds the view model type.
 */
export type TaskNativePatch = ClientTaskNativePatch<TaskPlanViewModel>;
export type TaskNativeDraftState = ClientTaskNativeDraftState<TaskPlanViewModel>;
export type TaskNativeSubmitContext = ClientTaskNativeSubmitContext<TaskPlanViewModel>;
export type TaskNativeEditSession = ClientTaskNativeEditSession<TaskPlanViewModel>;
