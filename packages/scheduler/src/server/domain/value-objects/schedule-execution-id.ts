import { createIdType } from '@memoflow/utils/domain';

import type { ScheduleExecutionId as IScheduleExecutionId } from '@memoflow/contracts/primitives';

/**
 * ScheduleExecutionId 值对象
 * 用于强类型化日程执行 ID
 */
export const ScheduleExecutionId = createIdType<IScheduleExecutionId>('IScheduleExecutionId');
export type ScheduleExecutionId = IScheduleExecutionId;
