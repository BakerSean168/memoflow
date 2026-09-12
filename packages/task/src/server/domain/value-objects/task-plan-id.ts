import { createIdType } from '@memoflow/utils/domain';

import type { TaskPlanId as ITaskPlanId } from '@memoflow/contracts/primitives';

/**
 * TaskPlanId 值对象
 * 用于强类型化任务模板 ID
 */
export const TaskPlanId = createIdType<ITaskPlanId>('ITaskPlanId');
export type TaskPlanId = ITaskPlanId;
