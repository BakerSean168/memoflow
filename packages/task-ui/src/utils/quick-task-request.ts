import type { CreateTaskPlanReq } from '@memoflow/task-contracts';
import { ImportanceLevel } from '@memoflow/shared-primitives';
import { taskUiHost } from '../task-ui-host';

export function buildQuickTaskRequest(title: string): CreateTaskPlanReq {
  return {
    name: title.trim(),
    description: null,
    schedule: {
      kind: 'OneTime',
      date: taskUiHost.getProductTodayYmd(),
      timing: { kind: 'AllDay' },
    },
    reminderConfig: null,
    importance: ImportanceLevel.Moderate,
    labelIds: [],
    goalBinding: null,
    checklist: [],
  };
}
