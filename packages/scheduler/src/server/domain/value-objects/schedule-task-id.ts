import { createIdType } from '@memoflow/utils/domain';

import type { ScheduleTaskId as IScheduleTaskId } from '@memoflow/contracts/primitives';

/**
 * ScheduleTaskId 值对象
 * 用于强类型化日程任务 ID
 */
export const ScheduleTaskId = createIdType<IScheduleTaskId>('IScheduleTaskId');
export type ScheduleTaskId = IScheduleTaskId;
