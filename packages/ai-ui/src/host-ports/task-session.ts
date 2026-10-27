import type { TaskNativeEditSession as ClientTaskNativeEditSession } from '@memoflow/task-client';
import type { TaskPlanView } from './task-view';

/** AI view-model instantiation of the client-owned Task native editing protocol. */
export type TaskNativeEditSession = ClientTaskNativeEditSession<TaskPlanView>;
