import { createIdType } from '@memoflow/utils/domain';

import type { GoalId as IGoalId } from '@memoflow/contracts/primitives';

/**
 * 全局 GoalId 类型定义
 * 因为 GoalId 在多个模块中使用（如 Account、Authentication 等）
 * 在所有模块中统一使用此类型以避免类型不兼容问题
 */
export const GoalId = createIdType<IGoalId>('IGoalId');
export type GoalId = IGoalId;
