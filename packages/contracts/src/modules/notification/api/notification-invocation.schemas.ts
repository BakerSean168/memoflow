/**
 * Notification Invocation Schemas
 * 通知操作调用契约
 *
 * Named composite request schemas that bind path params + body into the
 * canonical contract input validated by the shared validation adapters
 * (`expressAdapterWithValidation` / `ipcAdapterWithValidation`). Each schema is
 * the single source of truth for BOTH the OpenAPI request registration (via
 * `.shape`) and the runtime validator — never inline `z.object` in route
 * callbacks. Identity never appears in these bodies; it is supplied by the
 * canonical `ExecutionContext`.
 *
 * 命名复合请求 schema：把 path params + body 组合成 shared validation adapter
 * 校验的 canonical contract 输入。每个 schema 同时是 OpenAPI request 注册
 * （通过 `.shape`）与 runtime 校验器的唯一事实来源——绝不在 route callback 内
 * 拼内联 `z.object`。identity 永不出现于这些 body，而是由 canonical
 * `ExecutionContext` 提供。
 */

import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { NotificationId } from '../../../primitives';

/** `:id` path param for a notification-scoped route. 通知作用域路由的 `:id` path 参数。 */
export const NotificationIdParamsSchema = z.object({ id: brandedId<NotificationId>() });
export type NotificationIdParams = z.infer<typeof NotificationIdParamsSchema>;

/** `:id` path param for a dead-letter route (string operation id). 死信路由的 `:id` path 参数。 */
export const DeadLetterIdParamsSchema = z.object({ id: z.string().min(1) });
export type DeadLetterIdParams = z.infer<typeof DeadLetterIdParamsSchema>;

/** DELETE /:id — delete a notification (id-only command). 删除通知。 */
export const DeleteNotificationInvocationSchema = z.object({
  params: NotificationIdParamsSchema,
});
export type DeleteNotificationInvocation = z.infer<typeof DeleteNotificationInvocationSchema>;

/** PATCH /:id/read — mark a notification as read (id-only command). 标记通知为已读。 */
export const MarkNotificationReadInvocationSchema = z.object({
  params: NotificationIdParamsSchema,
});
export type MarkNotificationReadInvocation = z.infer<typeof MarkNotificationReadInvocationSchema>;

/** POST /:id/unread — mark a notification as unread. */
export const MarkNotificationUnreadInvocationSchema = z.object({
  params: NotificationIdParamsSchema,
});
export type MarkNotificationUnreadInvocation = z.infer<typeof MarkNotificationUnreadInvocationSchema>;

/** POST /:id/archive — archive a notification. */
export const ArchiveNotificationInvocationSchema = z.object({
  params: NotificationIdParamsSchema,
});
export type ArchiveNotificationInvocation = z.infer<typeof ArchiveNotificationInvocationSchema>;

/** POST /:id/restore — restore an archived notification. */
export const RestoreNotificationInvocationSchema = z.object({
  params: NotificationIdParamsSchema,
});
export type RestoreNotificationInvocation = z.infer<typeof RestoreNotificationInvocationSchema>;

/** POST /dead-letters/:id/replay — replay a dead-letter operation (id-only command). 重发死信操作。 */
export const ReplayDeadLetterInvocationSchema = z.object({
  params: DeadLetterIdParamsSchema,
});
export type ReplayDeadLetterInvocation = z.infer<typeof ReplayDeadLetterInvocationSchema>;

/** CLEAR_ALL channel — batch delete from a raw ids array projected to `{ notificationIds }`. */
export const NotificationBatchInvocationSchema = z.object({
  notificationIds: z.array(brandedId<NotificationId>()).min(1),
});
export type NotificationBatchInvocation = z.infer<typeof NotificationBatchInvocationSchema>;

// ============================================================================
// Void commands (identity-scoped; no payload)
// ============================================================================

/**
 * PATCH /read-all — void command. Accepts `undefined` (no body/args) or an
 * empty object; rejects any payload so the identity-scoped command can never
 * carry wire input.
 * PATCH /read-all — void 命令。接受 `undefined`（无 body/args）或空对象；
 * 拒绝任何 payload，使 identity 作用域命令永不携带 wire 输入。
 */
export const MarkAllNotificationsReadInvocationSchema = z.union([
  z.undefined(),
  z.object({}).strict(),
]);
export type MarkAllNotificationsReadInvocation = z.infer<
  typeof MarkAllNotificationsReadInvocationSchema
>;
