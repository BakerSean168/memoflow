import { createLogger } from '@memoflow/utils/logger';
import type { BusinessOperationReceipt } from '@memoflow/reliable-messaging-contracts';
import type {
  NotificationDispatchOutboxRow,
  NotificationReliableOperationPort,
  NotificationRuntimeContext,
  NotificationSharedOutboxMessageRow,
} from './notification.runtime';

const logger = createLogger('NotificationRuntime');

export interface ClaimedDispatchDeadLetterInput {
  readonly outbox: NotificationDispatchOutboxRow;
  readonly receipt: BusinessOperationReceipt;
  readonly claimContext: { ownerToken: string; fencingToken: number };
  readonly errorMsg: string;
  readonly reliableAdapter: NotificationReliableOperationPort;
}

/**
 * Terminal dead-letter transition for a claimed dispatch outbox entry.
 * W7 互斥语义：dead-letter 是独立终态，不再累计 outbox.failed。
 */
export async function recordClaimedDispatchDeadLetter(
  ctx: NotificationRuntimeContext,
  input: ClaimedDispatchDeadLetterInput,
): Promise<BusinessOperationReceipt> {
  const { outbox, receipt, claimContext, errorMsg, reliableAdapter } = input;
  const deadReceipt: BusinessOperationReceipt = {
    ...receipt,
    status: 'dead_letter',
    lease: null,
    deadLetterAt: new Date().toISOString(),
    lastError: errorMsg,
    updatedAt: new Date().toISOString(),
    attemptsHistory: [
      ...(receipt.attemptsHistory ?? []),
      {
        schemaVersion: 1,
        attempt: receipt.attempt,
        attemptedAt: new Date().toISOString(),
        result: 'failed',
        error: errorMsg,
        durationMs: null,
        channel: outbox.channel,
      },
    ],
  };

  const recordedReceipt = await reliableAdapter.recordDeliveryReceipt(deadReceipt, claimContext);
  if (recordedReceipt.status === 'dead_letter') {
    // W7 互斥语义：dead-letter 是独立终态，不再累计 outbox.failed
    ctx.metricsService.recordDeadLetter();

    logger.error('[NotificationRuntime] Outbox dispatch reached dead-letter state', {
      operationId: outbox.id,
      channel: outbox.channel,
      attempts: receipt.attempt,
      error: errorMsg,
    });
  } else {
    logger.warn('[NotificationRuntime] Outbox dead-letter completion ignored (stale owner)', {
      operationId: outbox.id,
    });
  }
  return recordedReceipt;
}

/**
 * Terminal/retryable transition for a shared `notification.requested` envelope
 * whose consumer threw. Uses the shared row's lease context for fencing.
 */
export async function markSharedFailed(
  ctx: NotificationRuntimeContext,
  sharedMsg: NotificationSharedOutboxMessageRow,
  leaseContext: {
    ownerToken: string;
    fencingToken: number;
    claimId: string;
  },
  error: unknown,
): Promise<void> {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const isDeadLetter = sharedMsg.attempts >= ctx.deadLetterThreshold;
  if (isDeadLetter) {
    const res = await ctx.deps?.reliableAdapter?.updateSharedOutboxStatus(
      sharedMsg.id,
      'dead_letter',
      errorMsg,
      null,
      leaseContext,
    );
    if (res === 'ok') {
      // W7 互斥语义：dead-letter 是独立终态，不再累计 outbox.failed
      ctx.metricsService.recordDeadLetter();
    } else {
      logger.warn(
        '[NotificationRuntime] Shared outbox dead-letter returned conflict (stale owner ignored)',
        {
          operationId: sharedMsg.id,
        },
      );
    }
    logger.error('[NotificationRuntime] Shared outbox reached dead-letter state', {
      operationId: sharedMsg.id,
      attempts: sharedMsg.attempts,
      error: errorMsg,
    });
    return;
  }
  const backoffMs = ctx.backoffBaseMs * 2 ** Math.max(0, sharedMsg.attempts - 1);
  const sharedReceipt = await ctx.deps?.reliableAdapter?.updateSharedOutboxStatus(
    sharedMsg.id,
    'retryable',
    errorMsg,
    new Date(Date.now() + backoffMs),
    leaseContext,
  );
  if (sharedReceipt === 'ok') {
    // W7 互斥语义：retryable 是独立状态，不再累计 outbox.failed
    ctx.metricsService.recordRetry();
    logger.warn('[NotificationRuntime] Shared outbox dispatch failed, scheduled retry', {
      operationId: sharedMsg.id,
      attempts: sharedMsg.attempts,
      error: errorMsg,
    });
  } else {
    logger.warn('[NotificationRuntime] Shared outbox failure update ignored (stale owner)', {
      operationId: sharedMsg.id,
    });
  }
}
