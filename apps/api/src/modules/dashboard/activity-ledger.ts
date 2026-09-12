/**
 * R6：Activity Ledger 记录器（API 宿主）。
 *
 * 订阅各模块关键事件，把业务活动写入 durable ledger，供 Dashboard 读模型
 * 以窗口查询解释"每次 Goal/KR 变化来自哪里"，而不是全量加载后内存拼接。
 *
 * 订阅集合保持克制（只记录可解释的变化）：
 * - goal:created / goal:completed / goal:review-added
 * - task:instance-completed / task:instance-uncompleted
 * - reminder:response-recorded
 * - schedule:task-executed
 */

import { createTypedEventSubscriber, eventBus } from '@memoflow/utils/domain';
import type { AppEventRegistry } from '@memoflow/contracts/shared';
import { createLogger } from '@memoflow/utils/logger';
import type { PrismaClient } from '@memoflow/database';

const logger = createLogger('ActivityLedger');

/**
 * Canonical durable activity-ledger entry shape.
 * 规范化的持久化 activity-ledger 条目形状。
 */
export interface ActivityEntry {
  /** Owner identity. 所属 identity。 */
  identityId: string;
  /** Acting principal. 操作主体。 */
  actorId: string;
  /** Business subject type (goal/task/reminder/schedule). 业务主体类型。 */
  subjectType: string;
  /** Business subject id. 业务主体 id。 */
  subjectId: string;
  /** Normalized action verb. 规范化的动作动词。 */
  action: string;
  /** Optional human-readable title. 可选的人类可读标题。 */
  title?: string | null;
  /** Optional correlation id. 可选关联 id。 */
  correlationId?: string | null;
  /** Optional before-state summary. 可选变更前摘要。 */
  beforeSummary?: string | null;
  /** Optional after-state summary. 可选变更后摘要。 */
  afterSummary?: string | null;
  /** Source event that produced this entry. 产生该条目的源事件。 */
  sourceEvent: string;
  /** Occurrence timestamp (epoch ms). 发生时间戳（epoch 毫秒）。 */
  occurredAt: number;
}

/**
 * Durable activity-ledger writer port.
 * 持久化 activity-ledger 写入 Port。
 */
export interface IActivityLedgerWriter {
  /**
   * Appends one activity entry durably.
   * 持久化追加一条 activity 条目。
   *
   * @param entry - The activity entry to persist.
   */
  append(entry: ActivityEntry): Promise<void>;
}

/**
 * Prisma-backed `IActivityLedgerWriter` adapter.
 * Prisma-backed `IActivityLedgerWriter` adapter，向 `activityLedger` 表写入条目。
 */
export class PrismaActivityLedgerWriter implements IActivityLedgerWriter {
  /**
   * Creates the adapter over a Prisma client.
   * 基于 Prisma client 创建 adapter。
   *
   * @param db - Prisma client bound by the host runtime.
   */
  constructor(private readonly db: PrismaClient) {}

  async append(entry: ActivityEntry): Promise<void> {
    await this.db.activityLedger.create({
      data: {
        id: crypto.randomUUID(),
        identityId: entry.identityId,
        actorId: entry.actorId,
        subjectType: entry.subjectType,
        subjectId: entry.subjectId,
        action: entry.action,
        title: entry.title ?? null,
        correlationId: entry.correlationId ?? null,
        beforeSummary: entry.beforeSummary ?? null,
        afterSummary: entry.afterSummary ?? null,
        sourceEvent: entry.sourceEvent,
        occurredAt: new Date(entry.occurredAt),
      },
    });
  }
}

/**
 * Creates the activity-ledger recorder subscribing to the shared event bus.
 * 创建订阅共享事件总线的 activity-ledger recorder。
 *
 * The recorder is infrastructure: it subscribes a curated set of module events
 * and appends durable entries; write failures never affect the business path.
 *
 * recorder 是基础设施：订阅一组克制的模块事件并追加 durable 条目；
 * 写入失败绝不影响业务主链路。
 *
 * @param writer - Durable writer for appended entries.
 * @returns A `{ start, stop }` runtime owning the subscription lifecycle.
 */
export function createActivityLedgerRecorder(writer: IActivityLedgerWriter): {
  start(): void;
  stop(): void;
} {
  // 记录器是基础设施：订阅各模块事件（宽松 payload，按需解构），
  // 写入失败不影响业务主链路。
  type Handler = (payload: Record<string, unknown>) => void;
  type LedgerEventName =
    | 'goal:created'
    | 'goal:completed'
    | 'goal:review-added'
    | 'task:instance-completed'
    | 'task:instance-uncompleted'
    | 'reminder:response-recorded'
    | 'schedule:task-executed';
  const events =
    createTypedEventSubscriber<
      Pick<
        AppEventRegistry,
        | 'goal:created'
        | 'goal:completed'
        | 'goal:review-added'
        | 'task:instance-completed'
        | 'task:instance-uncompleted'
        | 'reminder:response-recorded'
        | 'schedule:task-executed'
      >
    >(eventBus);
  const handlers = new Map<string, (payload: unknown) => void>();

  const safeAppend = async (entry: ActivityEntry): Promise<void> => {
    try {
      await writer.append(entry);
    } catch (error) {
      // Ledger 写入失败不影响业务主链路。
      logger.error('[ActivityLedger] append failed', {
        sourceEvent: entry.sourceEvent,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const subscribe = (eventName: LedgerEventName, handler: Handler): void => {
    const wrapped = (payload: unknown): void => {
      handler((payload ?? {}) as Record<string, unknown>);
    };
    events.on(eventName, wrapped);
    handlers.set(eventName, wrapped);
  };

  let started = false;

  return {
    start(): void {
      if (started) return;
      started = true;

      subscribe(
        'goal:created',
        (e) =>
          void safeAppend({
            identityId: String(e.identityId ?? ''),
            actorId: String(e.identityId ?? ''),
            subjectType: 'goal',
            subjectId: String((e.goal as Record<string, unknown>)?.id ?? ''),
            action: 'created',
            title: String((e.goal as Record<string, unknown>)?.name ?? ''),
            sourceEvent: 'goal:created',
            occurredAt: Date.now(),
          }),
      );
      subscribe(
        'goal:completed',
        (e) =>
          void safeAppend({
            identityId: String(e.identityId ?? ''),
            actorId: String(e.identityId ?? ''),
            subjectType: 'goal',
            subjectId: String((e.goal as Record<string, unknown>)?.id ?? ''),
            action: 'completed',
            title: String((e.goal as Record<string, unknown>)?.name ?? ''),
            sourceEvent: 'goal:completed',
            occurredAt: Date.now(),
          }),
      );
      subscribe(
        'goal:review-added',
        (e) =>
          void safeAppend({
            identityId: String(e.identityId ?? ''),
            actorId: String(e.identityId ?? ''),
            subjectType: 'goal',
            subjectId: String((e.goal as Record<string, unknown>)?.id ?? ''),
            action: 'review-added',
            title: String((e.goal as Record<string, unknown>)?.name ?? ''),
            sourceEvent: 'goal:review-added',
            occurredAt: Date.now(),
          }),
      );
      subscribe(
        'task:instance-completed',
        (e) =>
          void safeAppend({
            identityId: String(e.identityId ?? ''),
            actorId: String(e.identityId ?? ''),
            subjectType: 'task',
            subjectId: String(e.taskOccurrenceId ?? ''),
            action: 'completed',
            title: e.taskTitle != null ? String(e.taskTitle) : null,
            sourceEvent: 'task:instance-completed',
            occurredAt: Date.now(),
          }),
      );
      subscribe(
        'task:instance-uncompleted',
        (e) =>
          void safeAppend({
            identityId: String(e.identityId ?? ''),
            actorId: String(e.identityId ?? ''),
            subjectType: 'task',
            subjectId: String(e.taskOccurrenceId ?? ''),
            action: 'uncompleted',
            title: e.taskTitle != null ? String(e.taskTitle) : null,
            sourceEvent: 'task:instance-uncompleted',
            occurredAt: Date.now(),
          }),
      );
      subscribe(
        'reminder:response-recorded',
        (e) =>
          void safeAppend({
            identityId: String(e.identityId ?? ''),
            actorId: String(e.identityId ?? ''),
            subjectType: 'reminder',
            subjectId: String(e.responseId ?? ''),
            action: `response:${String(e.action ?? '').toLowerCase()}`,
            title: e.templateId != null ? String(e.templateId) : null,
            sourceEvent: 'reminder:response-recorded',
            occurredAt: typeof e.recordedAt === 'number' ? e.recordedAt : Date.now(),
          }),
      );
      subscribe(
        'schedule:task-executed',
        (e) =>
          void safeAppend({
            identityId: String(e.identityId ?? ''),
            actorId: String(e.identityId ?? ''),
            subjectType: 'schedule',
            subjectId: String(e.taskId ?? ''),
            action: 'executed',
            title: e.taskName != null ? String(e.taskName) : null,
            sourceEvent: 'schedule:task-executed',
            occurredAt: typeof e.executedAt === 'number' ? e.executedAt : Date.now(),
          }),
      );
      logger.info('[ActivityLedger] Recorder started');
    },

    stop(): void {
      if (!started) return;
      started = false;
      for (const [eventName, wrapped] of handlers) {
        events.off(eventName as LedgerEventName, wrapped);
      }
      handlers.clear();
      logger.info('[ActivityLedger] Recorder stopped');
    },
  };
}
