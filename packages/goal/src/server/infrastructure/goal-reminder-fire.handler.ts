/**
 * Goal reminder fire handler (GOAL-3202).
 * 目标提醒触发处理器（GOAL-3202）。
 *
 * Registers `goal.reminder.fire` (payloadVersion 2). The handler re-reads the
 * current Goal aggregate at fire time — if the Goal is no longer eligible
 * (completed / abandoned / archived / deleted / reminder disabled / trigger
 * disabled / missing) it returns `skipped` and writes nothing. Otherwise it
 * emits ONE idempotent durable `NotificationRequested` envelope whose
 * occurrence identity derives from the invocation schedulingKey, so a retry or
 * re-fire of the same invocation reconciles to the same outbox row.
 *
 * The Scheduler stays domain-neutral: it only knows the handlerKey +
 * payloadVersion. All Goal + NotificationRequested semantics live here.
 *
 * 注册 `goal.reminder.fire`（payloadVersion 2）。处理器在触发时重新读取 Goal
 * 聚合根——若 Goal 不再符合条件（已完成 / 已放弃 / 已归档 / 已删除 / 提醒关闭 /
 * 触发器关闭 / 不存在）则返回 `skipped` 且不写入任何内容。否则写入 ONE 条幂等
 * durable `NotificationRequested` 信封，其 occurrence 身份由 invocation
 * schedulingKey 推导，因此同一 invocation 的重试或重放会归并到同一 outbox 行。
 *
 * Scheduler 保持领域中立：它只认识 handlerKey + payloadVersion。Goal 与
 * NotificationRequested 的全部语义都在本文件。
 */

import {
  GoalStatus,
  GoalTimeframeSchema,
  ReminderTriggerType,
  type GoalServerDTO,
} from '@memoflow/contracts/goal';
import { YmdSchema } from '@memoflow/contracts/primitives';
import {
  NotificationCategory,
  NotificationChannelType,
  NotificationType,
  RelatedEntityType,
  NotificationRequestedSchema,
  type NotificationRequested,
  type NotificationRequestedOutboxInput,
  type NotificationRequestedWriterPort,
} from '@memoflow/contracts/notification';
import { buildIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
import type {
  ScheduledHandlerRegistration,
  ScheduledHandlerResult,
  ScheduledInvocationContext,
} from '@memoflow/contracts/schedule';
import { z } from 'zod';
import type { IGoalRepository } from '../domain';
import {
  GOAL_REMINDER_HANDLER_KEY,
  GOAL_REMINDER_PAYLOAD_VERSION,
} from './schedule-projection-source';

/** Source identity carried in the NotificationRequested idempotency triple. */
export const GOAL_REMINDER_NOTIFICATION_SOURCE = 'goal-reminder' as const;

/** Workflow key resolved by the Notification policy catalog on consumption. */
export const GOAL_REMINDER_WORKFLOW_KEY = 'goal.reminder' as const;

/**
 * Zod schema mirroring GoalReminderScheduledPayload (payloadVersion 2).
 * The registry validates every invocation payload against this schema before
 * the handler runs.
 */
export const GoalReminderFirePayloadSchema = z.object({
  goalId: z.string().min(1),
  goalTitle: z.string(),
  triggerType: z.enum(ReminderTriggerType),
  triggerValue: z.number(),
  startDate: YmdSchema.nullable(),
  target: GoalTimeframeSchema.nullable(),
  reminderTime: z.number().int(),
});
export type GoalReminderFirePayload = z.infer<typeof GoalReminderFirePayloadSchema>;

export interface CreateGoalReminderFireHandlerDeps {
  /** Goal aggregate read port (identity-scoped, current state). */
  readonly goalRepository: Pick<IGoalRepository, 'findByIdForIdentity'>;
  /** Durable NotificationRequested outbox writer (idempotent by operationId / idempotencyKey). */
  readonly requestedWriter: NotificationRequestedWriterPort;
}

type IneligibleReasonCode =
  | 'GOAL_NOT_FOUND'
  | 'GOAL_COMPLETED'
  | 'GOAL_ABANDONED'
  | 'GOAL_ARCHIVED'
  | 'GOAL_DELETED'
  | 'GOAL_NOT_IN_PROGRESS'
  | 'GOAL_REMINDER_DISABLED'
  | 'GOAL_TRIGGER_DISABLED';

function ineligibleReason(
  goal: GoalServerDTO | null,
  payload: GoalReminderFirePayload,
): { code: IneligibleReasonCode; message: string } | null {
  if (!goal) {
    return { code: 'GOAL_NOT_FOUND', message: 'Goal no longer exists.' };
  }
  if (goal.status === GoalStatus.Completed || goal.completedAt) {
    return { code: 'GOAL_COMPLETED', message: 'Goal has already been completed.' };
  }
  if (goal.status === GoalStatus.Abandoned) {
    return { code: 'GOAL_ABANDONED', message: 'Goal has been abandoned.' };
  }
  if (goal.archivedAt) {
    return { code: 'GOAL_ARCHIVED', message: 'Goal has been archived.' };
  }
  if (goal.deletedAt) {
    return { code: 'GOAL_DELETED', message: 'Goal has been deleted.' };
  }
  if (goal.status !== GoalStatus.InProgress) {
    return { code: 'GOAL_NOT_IN_PROGRESS', message: 'Goal is not in progress.' };
  }
  const enabled = goal.reminderConfig?.enabled === true;
  if (!enabled) {
    return { code: 'GOAL_REMINDER_DISABLED', message: 'Goal reminders are disabled.' };
  }
  const triggerEnabled = goal.reminderConfig?.triggers.some(
    (trigger) =>
      trigger.enabled &&
      trigger.type === payload.triggerType &&
      trigger.value === payload.triggerValue,
  );
  if (!triggerEnabled) {
    return { code: 'GOAL_TRIGGER_DISABLED', message: 'Reminder trigger is no longer enabled.' };
  }
  return null;
}

function buildReminderContent(
  goal: GoalServerDTO,
  payload: GoalReminderFirePayload,
): { title: string; content: string } {
  if (payload.triggerType === ReminderTriggerType.RemainingDays) {
    return {
      title: `目标提醒：${goal.name}`,
      content:
        payload.target && payload.target.kind !== 'day'
          ? `目标「${goal.name}」距离目标周期结束还有 ${payload.triggerValue} 天。`
          : `目标「${goal.name}」距离目标日期还有 ${payload.triggerValue} 天。`,
    };
  }
  if (payload.triggerType === ReminderTriggerType.TimeProgressPercentage) {
    return {
      title: `目标提醒：${goal.name}`,
      content: `目标「${goal.name}」已达到 ${payload.triggerValue}% 时间进度节点。`,
    };
  }
  return {
    title: `目标提醒：${goal.name}`,
    content: goal.summary ?? `目标「${goal.name}」已到达提醒时间。`,
  };
}

function buildNotificationRequested(
  context: ScheduledInvocationContext<GoalReminderFirePayload>,
  goal: GoalServerDTO,
): NotificationRequested {
  const identityId = String(goal.identityId);
  const occurrenceKey = context.schedulingKey;
  const envelope: NotificationRequested = {
    identityId,
    source: GOAL_REMINDER_NOTIFICATION_SOURCE,
    occurrenceKey,
    idempotencyKey: buildIdempotencyKeyString({
      identityId,
      source: GOAL_REMINDER_NOTIFICATION_SOURCE,
      occurrenceKey,
    }),
    workflowKey: GOAL_REMINDER_WORKFLOW_KEY,
    topic: GOAL_REMINDER_WORKFLOW_KEY,
    relatedEntity: { type: RelatedEntityType.Goal, id: goal.id },
    content: {
      type: NotificationType.Reminder,
      category: NotificationCategory.Goal,
      ...buildReminderContent(goal, context.payload),
    },
    suggestedChannels: [NotificationChannelType.InApp, NotificationChannelType.Push],
    correlationId: context.schedulingKey,
  };
  return NotificationRequestedSchema.parse(envelope);
}

export function buildGoalReminderOperationId(context: ScheduledInvocationContext): string {
  return `goal-reminder:${context.schedulingKey}`;
}

export async function executeGoalReminderFire(
  deps: CreateGoalReminderFireHandlerDeps,
  context: ScheduledInvocationContext<GoalReminderFirePayload>,
): Promise<ScheduledHandlerResult> {
  const requested = await deps.goalRepository.findByIdForIdentity(
    context.identityId,
    context.payload.goalId,
    { includeChildren: true },
  );
  const goal = requested ? requested.toServerDTO(true) : null;
  const reason = ineligibleReason(goal, context.payload);
  if (reason || !goal) {
    return {
      status: 'skipped',
      reason: reason?.message ?? 'Goal no longer exists.',
      result: {
        goalId: context.payload.goalId,
        triggerType: context.payload.triggerType,
        triggerValue: context.payload.triggerValue,
        skippedReason: reason?.code ?? 'GOAL_NOT_FOUND',
      },
    };
  }

  const envelope = buildNotificationRequested(context, goal);
  const input: NotificationRequestedOutboxInput = {
    operationId: buildGoalReminderOperationId(context),
    envelope,
  };
  const receipt = await deps.requestedWriter.enqueueNotificationRequested(input);

  return {
    status: 'succeeded',
    result: {
      goalId: goal.id,
      goalTitle: goal.name,
      triggerType: context.payload.triggerType,
      triggerValue: context.payload.triggerValue,
      operationId: receipt.operationId,
      idempotencyKey: envelope.idempotencyKey,
    },
  };
}

/**
 * Builds the `goal.reminder.fire` handler registration.
 * 构建 `goal.reminder.fire` 处理器注册。
 */
export function createGoalReminderFireHandler(
  deps: CreateGoalReminderFireHandlerDeps,
): ScheduledHandlerRegistration<GoalReminderFirePayload> {
  return {
    handlerKey: GOAL_REMINDER_HANDLER_KEY,
    payloadVersion: GOAL_REMINDER_PAYLOAD_VERSION,
    validatePayload: (payload: unknown) => GoalReminderFirePayloadSchema.parse(payload),
    handler: {
      execute(context) {
        return executeGoalReminderFire(deps, context);
      },
    },
  };
}
