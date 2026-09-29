import type { CreateTaskPlanReq } from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
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
