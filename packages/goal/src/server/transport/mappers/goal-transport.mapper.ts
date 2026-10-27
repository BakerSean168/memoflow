/**
 * Goal Transport Mappers
 * 目标传输层 Mapper
 *
 * Named boundary mappers that convert transport shapes into application/domain
 * inputs and response projections. Each mapper owns branded-id conversion,
 * nullable/default field handling and response projection; they never perform
 * persistence, authorization or business decisions.
 *
 * 命名边界 mapper：把传输形状转换为 application/domain 输入与响应投影。
 * 每个 mapper 负责 branded-id 转换、nullable/default 字段处理与响应投影，
 * 不执行持久化、授权或业务决策。
 */

import type { IdentityId } from '@memoflow/shared-primitives';
import type { GoalClientDTO } from '@memoflow/goal-contracts';
import type { GetKeyResultsRes } from '@memoflow/goal-contracts';

/**
 * Converts a plain context identity string into the branded `IdentityId` the
 * application port expects.
 * 把 context 中的纯字符串 identity 转换为 application port 期望的 branded
 * `IdentityId`。
 * @param identityId - Canonical ExecutionContext identityId (never a body field).
 * @returns The branded identity id.
 */
export function toIdentityId(identityId: string): IdentityId {
  return identityId as IdentityId;
}

/**
 * Projects a loaded GoalClientDTO into the `KeyResultListResSchema` shape.
 * Replaces the previous `Record<string, unknown>` extraction cast.
 * 把加载的 GoalClientDTO 投影为 `KeyResultListResSchema` 形状，替代原有的
 * `Record<string, unknown>` 提取强转。
 * @param goal - Goal client DTO loaded with key results.
 * @returns The key-result list response body.
 */
export function toKeyResultListResponse(goal: GoalClientDTO): GetKeyResultsRes {
  const keyResults = goal.keyResults ?? [];
  return {
    data: keyResults,
    total: keyResults.length,
  };
}
