/**
 * AggregateRepository Base Class
 *
 * Provides automatic domain event publishing after persistence.
 * All aggregate root repositories should extend this base class.
 *
 * Template Method pattern:
 * - save() defines algorithm skeleton: persist first, then publish events
 * - persist() is implemented by subclasses
 * - publishAggregateEvents() publishes and clears the aggregate event buffer
 *
 * Event handling:
 * - AggregateRoot.domainEvents provides the event list
 * - AggregateRoot.clearDomainEvents() clears published events
 */

import type { AggregateRoot } from '@memoflow/utils/domain';
import type { Equatable } from '@memoflow/shared-primitives';
import type { CausationId, CorrelationId } from '@memoflow/shared-primitives/command';
import type { IEventBus } from '../events';
import type { IOutboxWriter } from '../outbox';
import type { BusinessMetricRecorder } from '../observability';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('AggregateRepository');

export interface IAggregateRepository<T extends AggregateRoot<string | number | Equatable>> {
  save(aggregate: T): Promise<void>;
}

/**
 * 聚合事件发布选项（R1-2）。
 *
 * - eventBus：低延迟进程内投递目标（首选）；
 * - outboxWriter：持久化兜底。事件总线发布失败时，事件写入 durable
 *   outbox（可重试、可对账），而不是被吞掉后清空 buffer（原 P1-12）。
 * - 因果链信息：correlationId / causationId / identityId 透传给 outbox，
 *   使 R1-5 的可靠消息可回答"这条消息属于哪次操作、由谁引起"。
 */
export interface AggregateEventPublishOptions {
  eventBus: IEventBus;
  outboxWriter?: IOutboxWriter;
  correlationId?: CorrelationId | null;
  causationId?: CausationId | null;
  identityId?: string | null;
  /** R0-3：业务指标 recorder（可选）。 */
  metrics?: BusinessMetricRecorder;
}

/**
 * Publish and clear domain events accumulated on an aggregate.
 *
 * Reused by both save() (via AggregateRepositoryBase) and
 * deleteAggregate() (on concrete repositories).
 *
 * R1-2 行为变更：事件总线失败时不再"仅记日志并清空 buffer"——
 * 若提供 outboxWriter，失败事件落入 durable outbox（重试/对账）；
 * 未提供 outboxWriter 时保持向后兼容（记日志不抛出）。
 */
export async function publishAggregateEvents(
  aggregate: AggregateRoot<string | number | Equatable>,
  options: AggregateEventPublishOptions,
): Promise<void> {
  const { eventBus, outboxWriter, correlationId, causationId, identityId, metrics } = options;
  const events = aggregate.domainEvents;

  if (events.length === 0) {
    return;
  }

  for (const event of events) {
    try {
      await eventBus.publish(event);

      logger.debug('[AggregateRepository] Event published', {
        eventType: event.eventType,
        aggregateId: aggregate.id,
      });
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      if (outboxWriter) {
        try {
          const messageId = await outboxWriter.enqueue({
            messageType: event.eventType,
            payloadJson: JSON.stringify(event.payload ?? null),
            correlationId: correlationId ?? null,
            causationId: causationId ?? null,
            identityId: identityId ?? null,
          });
          logger.warn('[AggregateRepository] Event bus publish failed; persisted to outbox', {
            eventType: event.eventType,
            aggregateId: aggregate.id,
            messageId,
            error: errorText,
          });
          metrics?.increment('outbox.fallback.enqueued');
        } catch (outboxError) {
          // outbox 写入也失败：数据面已持久化，事件尽力投递，不抛出以免
          // 掩盖 aggregate 持久化成功的结果（上层仍可对账发现缺口）。
          logger.error('[AggregateRepository] Event publish and outbox fallback failed', {
            eventType: event.eventType,
            aggregateId: aggregate.id,
            error: errorText,
            outboxError: outboxError instanceof Error ? outboxError.message : String(outboxError),
          });
          metrics?.increment('outbox.fallback.failed');
        }
      } else {
        logger.error('[AggregateRepository] Event publish failed (no outbox fallback)', {
          eventType: event.eventType,
          aggregateId: aggregate.id,
          error: errorText,
        });
      }
    }
  }

  aggregate.clearDomainEvents();
}

/**
 * Aggregate root repository base class
 *
 * Responsibilities:
 * 1. Auto-publish domain events after successful persistence
 * 2. Handle event publish failures gracefully
 * 3. Provide a unified error handling pattern
 */
export abstract class AggregateRepositoryBase<
  T extends AggregateRoot<string | number | Equatable>,
> implements IAggregateRepository<T> {
  /**
   * @param eventBus 低延迟事件总线（首选投递目标）。
   * @param outboxWriter 可选 durable outbox 兜底（R1-2）：总线失败时事件入队，
   *                     不再被吞掉后清空 buffer。
   */
  constructor(
    protected readonly eventBus: IEventBus,
    protected readonly outboxWriter?: IOutboxWriter,
  ) {}

  /**
   * Save aggregate root (template method)
   *
   * Flow:
   * 1. Call subclass persist() to persist data
   * 2. On success, publish domain events (bus first, outbox fallback)
   * 3. Clear published events
   */
  async save(aggregate: T): Promise<void> {
    try {
      await this.persist(aggregate);
      await publishAggregateEvents(aggregate, {
        eventBus: this.eventBus,
        outboxWriter: this.outboxWriter,
      });

      logger.debug('[AggregateRepository] Aggregate saved and events published', {
        aggregateId: aggregate.id,
        eventCount: aggregate.domainEvents.length,
      });
    } catch (error) {
      logger.error('[AggregateRepository] Failed to save aggregate', {
        aggregateId: aggregate.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Persist aggregate root (implemented by subclass)
   *
   * Subclasses implement concrete persistence logic here.
   * No need to handle event publishing — the base class handles it.
   */
  protected abstract persist(aggregate: T): Promise<void>;
}
