/**
 * Task Invocation Schemas
 * 任务操作调用契约
 *
 * Named composite request schemas that bind path params + body/query into the
 * canonical contract input validated by the shared validation adapters
 * (`expressAdapterWithValidation` / `ipcAdapterWithValidation`). Each schema is
 * the single source of truth for BOTH the OpenAPI request registration (via
 * `.shape`) and the runtime validator — never inline `z.object` in route
 * callbacks. Identity never appears in these bodies; it is supplied by the
 * canonical `ExecutionContext`.
 *
 * 命名复合请求 schema：把 path params + body/query 组合成 shared validation
 * adapter 校验的 canonical contract 输入。每个 schema 同时是 OpenAPI request
 * 注册（通过 `.shape`）与 runtime 校验器的唯一事实来源——绝不在 route callback
 * 内拼内联 `z.object`。identity 永不出现于这些 body，而是由 canonical
 * `ExecutionContext` 提供。
 */

import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { TaskOccurrenceId, TaskPlanId } from '../../../primitives';
import {
  GenerateOccurrencesSchema,
  TaskGoalBindingSchema,
  UpdateTaskPlanSchema,
  AbandonTaskPlanSchema,
} from './task-plan.dto';
import {
  CompleteTaskOccurrenceSchema,
  MarkTaskOccurrenceMissedSchema,
  SetTaskOccurrenceChecklistItemSchema,
  SkipTaskOccurrenceSchema,
} from './task-occurrence.dto';
import { RescheduleTaskBodySchema } from './task-schedule.dto';

// ============================================================================
// Shared route params
// ============================================================================

/** `:id` path param for a task-plan-scoped route. 任务模板作用域路由的 `:id` path 参数。 */
export const TaskPlanIdParamsSchema = z.object({ id: brandedId<TaskPlanId>() });
export type TaskPlanIdParams = z.infer<typeof TaskPlanIdParamsSchema>;

/** `:id` path param for a task-occurrence-scoped route. 任务实例作用域路由的 `:id` path 参数。 */
export const TaskOccurrenceIdParamsSchema = z.object({ id: brandedId<TaskOccurrenceId>() });
export type TaskOccurrenceIdParams = z.infer<typeof TaskOccurrenceIdParamsSchema>;

// ============================================================================
// Template mutations
// ============================================================================

/** PUT/PATCH /:id — update a plan. 更新任务模板。 */
export const UpdateTaskPlanInvocationSchema = z.object({
  params: TaskPlanIdParamsSchema,
  body: UpdateTaskPlanSchema,
});
export type UpdateTaskPlanInvocation = z.infer<typeof UpdateTaskPlanInvocationSchema>;

/** POST /:id/generate-occurrences — generate occurrences for a plan. 为模板生成实例。 */
export const GenerateOccurrencesInvocationSchema = z.object({
  params: TaskPlanIdParamsSchema,
  body: GenerateOccurrencesSchema,
});
export type GenerateOccurrencesInvocation = z.infer<typeof GenerateOccurrencesInvocationSchema>;

/** POST /:id/bind-goal — bind a plan to a goal. 绑定模板到目标。 */
export const BindTaskToGoalInvocationSchema = z.object({
  params: TaskPlanIdParamsSchema,
  body: TaskGoalBindingSchema,
});
export type BindTaskToGoalInvocation = z.infer<typeof BindTaskToGoalInvocationSchema>;

/** POST /:id/activate | /pause | /archive | /unbind-goal — id-only plan commands. 模板 id-only 命令。 */
export const TaskPlanIdCommandInvocationSchema = z.object({
  params: TaskPlanIdParamsSchema,
});
export type TaskPlanIdCommandInvocation = z.infer<typeof TaskPlanIdCommandInvocationSchema>;

/** POST /:id/abandon — explicit user abandonment of the Task plan. */
export const AbandonTaskPlanInvocationSchema = z.object({
  params: TaskPlanIdParamsSchema,
  body: AbandonTaskPlanSchema,
});
export type AbandonTaskPlanInvocation = z.infer<typeof AbandonTaskPlanInvocationSchema>;

// ============================================================================
// Instance mutations
// ============================================================================

/** POST /:id/complete — complete an occurrence. 完成任务实例。 */
export const CompleteTaskOccurrenceInvocationSchema = z.object({
  params: TaskOccurrenceIdParamsSchema,
  body: CompleteTaskOccurrenceSchema,
});
export type CompleteTaskOccurrenceInvocation = z.infer<
  typeof CompleteTaskOccurrenceInvocationSchema
>;

/** POST /:id/skip — skip an occurrence. 跳过任务实例。 */
export const SkipTaskOccurrenceInvocationSchema = z.object({
  params: TaskOccurrenceIdParamsSchema,
  body: SkipTaskOccurrenceSchema,
});
export type SkipTaskOccurrenceInvocation = z.infer<typeof SkipTaskOccurrenceInvocationSchema>;

/** POST /:id/missed — explicitly record a missed occurrence. */
export const MarkTaskOccurrenceMissedInvocationSchema = z.object({
  params: TaskOccurrenceIdParamsSchema,
  body: MarkTaskOccurrenceMissedSchema,
});
export type MarkTaskOccurrenceMissedInvocation = z.infer<
  typeof MarkTaskOccurrenceMissedInvocationSchema
>;

/** POST /:id/checklist — set one occurrence-owned checklist item state. */
export const SetTaskOccurrenceChecklistItemInvocationSchema = z.object({
  params: TaskOccurrenceIdParamsSchema,
  body: SetTaskOccurrenceChecklistItemSchema,
});
export type SetTaskOccurrenceChecklistItemInvocation = z.infer<
  typeof SetTaskOccurrenceChecklistItemInvocationSchema
>;

/** POST /:id/reschedule — mutate this occurrence's own time, never the plan or Scheduler row. */
export const RescheduleTaskOccurrenceInvocationSchema = z.object({
  params: TaskOccurrenceIdParamsSchema,
  body: RescheduleTaskBodySchema,
});
export type RescheduleTaskOccurrenceInvocation = z.infer<
  typeof RescheduleTaskOccurrenceInvocationSchema
>;

/** POST /:id/start | /uncomplete — id-only occurrence commands. 实例 id-only 命令。 */
export const TaskOccurrenceIdCommandInvocationSchema = z.object({
  params: TaskOccurrenceIdParamsSchema,
});
export type TaskOccurrenceIdCommandInvocation = z.infer<
  typeof TaskOccurrenceIdCommandInvocationSchema
>;
