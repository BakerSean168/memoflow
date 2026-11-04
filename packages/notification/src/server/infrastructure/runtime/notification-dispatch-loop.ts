import { createLogger } from '@memoflow/utils/logger';
import {
  NotificationChannelType as ChannelTypeEnum,
  NotificationRequestedSchema,
  NOTIFICATION_REQUESTED_MESSAGE_TYPE,
} from '@memoflow/notification-contracts';
import type { BusinessOperationReceipt } from '@memoflow/reliable-messaging-contracts';
import type { Notification } from '../../domain/aggregates/notification';
import type {
  NotificationDeliveryTarget,
  NotificationDispatchOutboxRow,
  NotificationRuntimeContext,
  NotificationSharedOutboxMessageRow,
} from './notification.runtime';
import { markSharedFailed, recordClaimedDispatchDeadLetter } from './notification-dead-letter';
import { broadcastDurableDelivery } from './notification-sse-adapter';

const logger = createLogger('NotificationRuntime');

export interface NotificationRuntimeDispatchLoopPort {
  start(): void;
  stop(): void;
  tick(): Promise<void>;
}

/**
 * Durable dispatch loop: claims the dispatch outbox (Priority 1) and the
 * canonical `notification.requested` shared outbox (Priority 2) in the same
 * order as the pre-split runtime. All mutable loop state (started / timer /
 * in-flight flush guard) and the shared adapter seam live on the runtime
 * context so the factory and every extracted part observe one instance.
 */
export function createNotificationDispatchLoop(
  ctx: NotificationRuntimeContext,
): NotificationRuntimeDispatchLoopPort {
  /**
   * Deliver a claimed durable dispatch outbox entry using W0 lease/claim fencing.
   * Returns the final recorded receipt so callers can reconcile downstream state.
   */
  const processClaimedDispatch = async (entry: {
    claimed: boolean;
    receipt: BusinessOperationReceipt;
    outbox: NotificationDispatchOutboxRow;
    notification?: Notification | null;
  }): Promise<BusinessOperationReceipt> => {
    const { receipt, outbox } = entry;
    if (!entry.claimed) return receipt;

    const reliableAdapter = ctx.reliableAdapter;
    if (!reliableAdapter) {
      throw new Error(
        '[FAIL-FAST] NotificationRuntime requires a reliableAdapter to record delivery receipts.',
      );
    }

    ctx.metricsService.recordDispatched();

    const claimContext = {
      ownerToken: receipt.lease?.ownerToken ?? outbox.ownerToken ?? ctx.ownerToken,
      fencingToken: receipt.lease?.fencingToken ?? outbox.fencingToken,
    };

    let notification: Notification | null = entry.notification ?? null;
    if (!notification && ctx.repository) {
      notification = await ctx.repository.findByIdForIdentity(
        outbox.identityId,
        outbox.notificationId,
      );
    }

    let payloadData: Record<string, unknown> = {};
    try {
      payloadData = JSON.parse(outbox.payloadJson);
    } catch {
      payloadData = {};
    }

    const deliveryContext = {
      deliveryId: outbox.id,
      idempotencyKey: outbox.idempotencyKey,
      identityId: outbox.identityId,
    };

    try {
      const deliverer = ctx.getDelivererForChannel(outbox.channel);

      const deliveryTarget: NotificationDeliveryTarget = {
        channelType: outbox.channel,
        recipient: outbox.identityId,
      };
      let deliveryResult: void | { status: 'suppressed'; reason: string };
      if (notification) {
        deliveryResult = await deliverer.deliver(notification, deliveryTarget, deliveryContext);
      } else {
        // No persisted Fact is required to execute a durable dispatch.
        deliveryResult = await deliverer.deliver(
          {
            id: outbox.notificationId,
            identityId: outbox.identityId,
            title: (payloadData.title as string) ?? 'Notification',
            content: (payloadData.content as string) ?? '',
            type: (payloadData.type as never) ?? 'Info',
            category: (payloadData.category as never) ?? 'System',
          } as never,
          deliveryTarget,
          deliveryContext,
        );
      }

      if (deliveryResult?.status === 'suppressed') {
        logger.info('[NotificationRuntime] Desktop delivery suppressed', {
          operationId: outbox.id,
          channel: outbox.channel,
          reason: deliveryResult.reason,
        });
        return reliableAdapter.recordDeliveryReceipt(
          {
            ...receipt,
            status: 'skipped',
            lease: null,
            lastError: null,
            nextRetryAt: null,
            deadLetterAt: null,
            finishedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            attemptsHistory: [
              ...(receipt.attemptsHistory ?? []),
              {
                schemaVersion: 1,
                attempt: receipt.attempt,
                attemptedAt: new Date().toISOString(),
                result: 'skipped',
                error: null,
                durationMs: null,
                channel: outbox.channel,
              },
            ],
          },
          claimContext,
        );
      }

      const updatedReceipt: BusinessOperationReceipt = {
        ...receipt,
        status: 'succeeded',
        lease: null,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attemptsHistory: [
          ...(receipt.attemptsHistory ?? []),
          {
            schemaVersion: 1,
            attempt: receipt.attempt,
            attemptedAt: new Date().toISOString(),
            result: 'succeeded',
            error: null,
            durationMs: null,
            channel: outbox.channel,
          },
        ],
      };

      const recordedReceipt = await reliableAdapter.recordDeliveryReceipt(
        updatedReceipt,
        claimContext,
      );
      const isApplied =
        (recordedReceipt as BusinessOperationReceipt & { applied?: boolean }).applied !== false;

      if (recordedReceipt.status === 'succeeded' && isApplied) {
        ctx.metricsService.recordDelivered();

        // SSE is a read-only outbox consumer: broadcast the real-time delivery
        // event only AFTER the durable receipt is persisted.
        broadcastDurableDelivery(ctx, outbox, payloadData, recordedReceipt);

        logger.info('[NotificationRuntime] Outbox dispatch succeeded', {
          operationId: outbox.id,
          channel: outbox.channel,
          identityId: outbox.identityId,
        });
      } else {
        logger.warn(
          '[NotificationRuntime] Outbox completion condition failed (stale owner or preempted)',
          {
            operationId: outbox.id,
            expectedStatus: 'succeeded',
            actualStatus: recordedReceipt.status,
          },
        );
      }
      return recordedReceipt;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isDeadLetter = receipt.attempt >= ctx.deadLetterThreshold;

      if (isDeadLetter) {
        return recordClaimedDispatchDeadLetter(ctx, {
          outbox,
          receipt,
          claimContext,
          errorMsg,
          reliableAdapter,
        });
      }

      const backoffMs = ctx.backoffBaseMs * 2 ** Math.max(0, receipt.attempt - 1);
      const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

      const retryReceipt: BusinessOperationReceipt = {
        ...receipt,
        status: 'retryable',
        lease: null,
        nextRetryAt,
        lastError: errorMsg,
        updatedAt: new Date().toISOString(),
        attemptsHistory: [
          ...(receipt.attemptsHistory ?? []),
          {
            schemaVersion: 1,
            attempt: receipt.attempt,
            attemptedAt: new Date().toISOString(),
            result: 'retryable',
            error: errorMsg,
            durationMs: null,
            channel: outbox.channel,
          },
        ],
      };

      const recordedReceipt = await reliableAdapter.recordDeliveryReceipt(
        retryReceipt,
        claimContext,
      );
      if (recordedReceipt.status === 'retryable') {
        // W7 互斥语义：retryable 是独立状态，不再累计 outbox.failed
        ctx.metricsService.recordRetry();

        logger.warn('[NotificationRuntime] Outbox dispatch failed, scheduled retry', {
          operationId: outbox.id,
          channel: outbox.channel,
          attempts: receipt.attempt,
          nextRetryAt,
          error: errorMsg,
        });
      } else {
        logger.warn('[NotificationRuntime] Outbox retry completion ignored (stale owner)', {
          operationId: outbox.id,
        });
      }
      return recordedReceipt;
    }
  };

  /**
   * Priority 2: consume a `notification.requested` shared envelope.
   *
   * Reuses CreateNotificationUseCase so the Fact + DeliveryPlan + dispatch
   * outboxes materialize in one transactional save(). The dispatch rows are
   * picked up by the next tick's claimOutboxDispatch (Priority 1) or by the
   * shared dispatch path — external channel delivery stays strictly out of this
   * handler's critical path.
   */
  const processNotificationRequested = async (
    sharedMsg: NotificationSharedOutboxMessageRow,
  ): Promise<void> => {
    if (!ctx.repository || !ctx.preferenceRepository) {
      throw new Error(
        '[FAIL-CLOSED] notification.requested consumer requires repository + preferenceRepository for policy evaluation.',
      );
    }
    const useCase = ctx.getCreateNotificationUseCase();
    let envelope: import('@memoflow/notification-contracts').NotificationRequested;
    try {
      envelope = NotificationRequestedSchema.parse(JSON.parse(sharedMsg.payloadJson));
    } catch (cause) {
      throw new Error(
        `Invalid NotificationRequested envelope for '${sharedMsg.id}': ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
    const result = await useCase.execute({
      identityId: envelope.identityId,
      workflowKey: envelope.workflowKey,
      topic: envelope.topic,
      idempotencyKey: envelope.idempotencyKey,
      title: envelope.content.title,
      content: envelope.content.content,
      type: envelope.content.type ?? 'Info',
      category: envelope.content.category ?? 'Other',
      importance: envelope.importance,
      urgency: envelope.urgency,
      relatedEntityType: envelope.relatedEntity?.type,
      relatedEntityId: envelope.relatedEntity?.id ?? undefined,
      navigationIntent: envelope.navigationIntent ?? null,
      actions: envelope.actions,
      channels:
        envelope.suggestedChannels && envelope.suggestedChannels.length > 0
          ? [...new Set(envelope.suggestedChannels)]
          : [ChannelTypeEnum.InApp],
      expiresAt: envelope.expiresAt ?? null,
      // Correlation/causation chain is carried durably on the shared-outbox row
      // (writer resolves envelope -> input -> operationId and persists the
      // winner). Prefer the durable values so caller-provided fallbacks survive
      // consumer materialization, not just the envelope attributes.
      correlationId: sharedMsg.correlationId ?? envelope.correlationId ?? null,
      causationId: sharedMsg.causationId ?? envelope.causationId ?? null,
    });
    if (!result.ok) {
      throw new Error(`NotificationRequested materialization failed: ${result.error.message}`);
    }
  };

  const tick = async (): Promise<void> => {
    const reliableAdapter = ctx.deps?.reliableAdapter;
    if (!reliableAdapter) {
      throw new Error(
        '[FAIL-FAST] NotificationRuntime requires a reliableAdapter. Non-durable repository fallback is strictly prohibited.',
      );
    }
    if (ctx.flushing) return;
    ctx.flushing = true;
    try {
      // Priority 1: Process the durable NotificationDispatchOutbox via lease/claim.
      const claimedEntries = await reliableAdapter.claimOutboxDispatch({
        ownerToken: ctx.ownerToken,
        leaseDurationMs: ctx.leaseDurationMs,
        limit: 50,
      });

      for (const entry of claimedEntries) {
        await processClaimedDispatch(entry);
      }

      // Priority 2: canonical cross-module `notification.requested` envelopes only.
      // The shared row's leaseExpiresAt deadline is the recoverable consumer lease.
      const sharedOutboxes = await reliableAdapter.claimSharedOutboxIntents({
        ownerToken: ctx.ownerToken,
        leaseDurationMs: ctx.leaseDurationMs,
        limit: 50,
      });

      for (const sharedMsg of sharedOutboxes) {
        const leaseContext = {
          ownerToken: sharedMsg.ownerToken!,
          claimId: sharedMsg.claimId!,
          fencingToken: sharedMsg.fencingToken!,
        };
        try {
          if (sharedMsg.messageType !== NOTIFICATION_REQUESTED_MESSAGE_TYPE) {
            throw new Error(
              `[FAIL-CLOSED] Unsupported shared notification message type: ${sharedMsg.messageType}`,
            );
          }
          await processNotificationRequested(sharedMsg);
          const res = await reliableAdapter.updateSharedOutboxStatus(
            sharedMsg.id,
            'succeeded',
            null,
            null,
            leaseContext,
          );
          if (res === 'ok') {
            ctx.metricsService.recordDelivered();
          } else {
            logger.warn(
              '[NotificationRuntime] Shared outbox notification.requested completion returned conflict (stale owner ignored)',
              { operationId: sharedMsg.id },
            );
          }
        } catch (error) {
          await markSharedFailed(ctx, sharedMsg, leaseContext, error);
        }
      }

      ctx.metricsService.recordWorkerOutcome('completed');
    } catch (error) {
      logger.error('[NotificationRuntime] Channel worker tick failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      ctx.metricsService.recordWorkerOutcome('failed');
    } finally {
      ctx.flushing = false;
    }
  };

  return {
    start(): void {
      if (!ctx.deps?.reliableAdapter) {
        throw new Error(
          '[FAIL-FAST] NotificationRuntime requires a reliableAdapter. Non-durable repository fallback is strictly prohibited.',
        );
      }
      if (ctx.started) return;
      ctx.started = true;
      void tick();
      ctx.timer = setInterval(() => void tick(), ctx.pollIntervalMs);
      ctx.timer.unref?.();
      logger.info('[Notification] Channel worker started', { pollIntervalMs: ctx.pollIntervalMs });
    },

    stop(): void {
      if (!ctx.started) return;
      ctx.started = false;
      if (ctx.timer) {
        clearInterval(ctx.timer);
        ctx.timer = null;
      }
      logger.info('[Notification] Channel worker stopped');
    },

    tick,
  };
}
