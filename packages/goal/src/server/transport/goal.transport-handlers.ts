/**
 * Goal transport handler mapping.
 * 目标模块传输层处理器映射。
 *
 * This file converts the module's transport-neutral `GoalApplicationPort` into
 * the function signatures required by controllers. It is shared by HTTP and
 * Electron transports so the mapping is defined once.
 *
 * 这个文件把模块的传输层无关 `GoalApplicationPort` 转换成控制器所需的函数签名。
 * HTTP 和 Electron 共用这一层，避免重复定义同样的 handler 映射。
 */

import type { GoalApplicationPort } from '../application';
import type { GoalUseCases } from './goal.controller';

/**
 * Map GoalApplicationPort to GoalUseCases (controller port).
 * 将 GoalApplicationPort 映射为 GoalUseCases（控制器端口）。
 *
 * GoalApplicationPort already exposes plain functions, so this is a thin
 * regrouping layer instead of a wrapper factory.
 * GoalApplicationPort 已经暴露普通函数，因此这里是轻量分组，而不是包装层。
 */
export function createGoalTransportHandlers(api: GoalApplicationPort): GoalUseCases {
  return {
    createGoal: api.createGoal,
    getGoal: api.getGoal,
    listGoals: api.listGoals,
    updateGoal: api.updateGoal,
    deleteGoal: api.deleteGoal,
    archiveGoal: api.archiveGoal,
    abandonGoal: api.abandonGoal,
    planGoal: api.planGoal,
    activateGoal: api.activateGoal,
    completeGoal: api.completeGoal,
    searchGoals: api.searchGoals,
    addKeyResult: api.addKeyResult,
    updateKeyResult: api.updateKeyResult,
    updateKeyResultProgress: api.updateKeyResultProgress,
    deleteKeyResult: api.deleteKeyResult,
    addReview: api.addReview,
    listReviews: api.listReviews,
    getReviewContext: api.getReviewContext,
    updateReview: api.updateReview,
    deleteReview: api.deleteReview,
    createRecord: api.createRecord,
    updateRecord: api.updateRecord,
    listRecords: api.listRecords,
    deleteRecord: api.deleteRecord,
    getGoalAggregate: api.getGoalAggregate,
    cloneGoal: api.cloneGoal,
    batchUpdateKeyResultWeights: api.batchUpdateKeyResultWeights,
  };
}
