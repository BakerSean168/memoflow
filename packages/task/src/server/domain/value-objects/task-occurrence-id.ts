import { createIdType } from '@memoflow/utils/domain';

import type { TaskOccurrenceId as ITaskOccurrenceId } from '@memoflow/contracts/primitives';

/**
 * TaskOccurrenceId 值对象
 * 用于强类型化任务实例 ID
 */
export const TaskOccurrenceId = createIdType<ITaskOccurrenceId>('ITaskOccurrenceId');
export type TaskOccurrenceId = ITaskOccurrenceId;
