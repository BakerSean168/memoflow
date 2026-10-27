import { createIdType } from '@memoflow/utils/domain';

import type { ScheduleId as IScheduleId } from '@memoflow/schedule-contracts';

/**
 * ScheduleId 值对象
 * 用于强类型化日程 ID
 */
export const ScheduleId = createIdType<IScheduleId>('IScheduleId');
export type ScheduleId = IScheduleId;
