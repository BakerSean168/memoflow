import type { CreateTaskPlanReq } from '@memoflow/task-contracts';
import { ImportanceLevel } from '@memoflow/shared-primitives';
import { getProductTodayYmd } from '../../../shared/utils/product-time';

export function buildQuickTaskRequest(title: string): CreateTaskPlanReq {
  return {
    name: title.trim(),
    description: null,
    schedule: {
      kind: 'OneTime',
      date: getProductTodayYmd(),
      timing: { kind: 'AllDay' },
    },
    reminderConfig: null,
    importance: ImportanceLevel.Moderate,
    labelIds: [],
    goalBinding: null,
    checklist: [],
  };
}
