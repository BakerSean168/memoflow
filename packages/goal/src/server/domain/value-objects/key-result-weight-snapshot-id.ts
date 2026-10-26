import { createIdType } from '@memoflow/utils/domain';

import type { KeyResultWeightSnapshotId as IKeyResultWeightSnapshotId } from '@memoflow/goal-contracts';

/**
 * KeyResultWeightSnapshotId 值对象
 * 用于强类型化关键结果权重快照 ID
 */
export const KeyResultWeightSnapshotId = createIdType<IKeyResultWeightSnapshotId>(
  'IKeyResultWeightSnapshotId',
);
export type KeyResultWeightSnapshotId = IKeyResultWeightSnapshotId;
