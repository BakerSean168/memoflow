/**
 * Goal Module - RPC Map Definition
 *
 * 【规范说明：RPC 协议】
 * 所有 RPC 请求/响应类型必须从 ../api 导入，确保类型安全
 * RPC map 只定义 [Request, Response] 对，不包含内联类型定义
 */

import type {
  CreateGoalReq,
  CreateGoalRes,
  GetGoalReq,
  GetGoalRes,
  ListGoalFilters,
} from '../api/goal-crud.dto';
import type { GetKeyResultsReq, GetKeyResultsRes } from '../api/key-result.dto';
import type {
  GoalMutationReceipt,
  GoalReviewSystemContext,
  QueryGoalsRes,
} from '../api/response-schemas';
import type {
  AddKeyResultInvocation,
  BatchKeyResultWeightsInvocation,
  CloneGoalInvocation,
  CreateRecordInvocation,
  CreateReviewInvocation,
  ReviewContextInvocation,
  DeleteGoalInvocation,
  DeleteKeyResultInvocation,
  DeleteRecordInvocation,
  DeleteReviewInvocation,
  GoalStatusCommandInvocation,
  UpdateGoalInvocation,
  UpdateKeyResultInvocation,
  UpdateKeyResultProgressInvocation,
  UpdateReviewInvocation,
  UpdateRecordInvocation,
} from '../api/goal-invocation.schemas';

/**
 * 定义 Goal 模块处理的 RPC 请求 [请求, 响应]
 *
 * 【使用说明】
 * - HTTP 复合 mutation（params + body/query）以命名 invocation schema 的
 *   `z.infer` 类型作为 map 的请求类型，与 OpenAPI request 共享同一 schema 对象。
 * - IPC positional args 由 channel 注册旁的命名 projector 投影为同一 invocation 形状。
 * - Response 一律使用 contracts response schema 的 `z.infer` 类型。
 *
 * 【使用示例】
 * ```typescript
 * type Response = GoalRpcMap['goal:create'][1]; // CreateGoalRes
 * const req: GoalRpcMap['goal:create'][0] = { ... }; // CreateGoalReq
 * ```
 */
export type GoalRpcMap = {
  // Goal CRUD + core mutations
  'goal:create': [CreateGoalReq, CreateGoalRes];
  'goal:update': [UpdateGoalInvocation, GoalMutationReceipt];
  'goal:delete': [DeleteGoalInvocation, GoalMutationReceipt];
  'goal:archive': [GoalStatusCommandInvocation, GoalMutationReceipt];
  'goal:plan': [GoalStatusCommandInvocation, GoalMutationReceipt];
  'goal:activate': [GoalStatusCommandInvocation, GoalMutationReceipt];
  'goal:complete': [GoalStatusCommandInvocation, GoalMutationReceipt];
  'goal:abandon': [GoalStatusCommandInvocation, GoalMutationReceipt];
  'goal:clone': [CloneGoalInvocation, GoalMutationReceipt];
  'goal:get': [GetGoalReq, GetGoalRes];
  'goal:list': [ListGoalFilters, QueryGoalsRes];

  // Key Result Operations
  'key-result:add': [AddKeyResultInvocation, GoalMutationReceipt];
  'key-result:update': [UpdateKeyResultInvocation, GoalMutationReceipt];
  'key-result:progress': [UpdateKeyResultProgressInvocation, GoalMutationReceipt];
  'key-result:delete': [DeleteKeyResultInvocation, GoalMutationReceipt];
  'key-result:batch-weights': [BatchKeyResultWeightsInvocation, GoalMutationReceipt];
  'key-result:list': [GetKeyResultsReq, GetKeyResultsRes];

  // Review Operations
  'goal:review:create': [CreateReviewInvocation, GoalMutationReceipt];
  'goal:review:context': [ReviewContextInvocation, GoalReviewSystemContext];
  'goal:review:update': [UpdateReviewInvocation, GoalMutationReceipt];
  'goal:review:delete': [DeleteReviewInvocation, GoalMutationReceipt];

  // Record Operations
  'goal:record:create': [CreateRecordInvocation, GoalMutationReceipt];
  'goal:record:update': [UpdateRecordInvocation, GoalMutationReceipt];
  'goal:record:delete': [DeleteRecordInvocation, GoalMutationReceipt];
};
