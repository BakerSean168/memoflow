/**
 * Notification Metrics Service
 *
 * Telemetry counters for Notification channel durable outbox dispatch lifecycle:
 * - persisted
 * - dispatched
 * - delivered
 * - failed
 * - retry
 * - dead-letter
 */

import type { UnifiedOperationMetricsRecorder } from '@memoflow/patterns/operations';
import {
  createUnifiedOperationMetricsRecorder,
  globalUnifiedOperationMetrics,
} from '@memoflow/patterns/operations';

export interface NotificationMetricsSnapshot {
  readonly persistedTotal: number;
  readonly dispatchedTotal: number;
  readonly deliveredTotal: number;
  readonly failedTotal: number;
  readonly retryTotal: number;
  readonly deadLetterTotal: number;
}

export class NotificationMetricsService {
  private persistedTotal = 0;
  private dispatchedTotal = 0;
  private deliveredTotal = 0;
  private failedTotal = 0;
  private retryTotal = 0;
  private deadLetterTotal = 0;
  private readonly unified: UnifiedOperationMetricsRecorder;

  constructor(unified?: UnifiedOperationMetricsRecorder) {
    this.unified = unified ?? createUnifiedOperationMetricsRecorder();
  }

  recordPersisted(count = 1): void {
    this.persistedTotal += count;
    this.unified.recordOutbox('notification', 'persisted', count);
  }

  recordDispatched(count = 1): void {
    this.dispatchedTotal += count;
    this.unified.recordOutbox('notification', 'claimed', count);
  }

  recordDelivered(count = 1): void {
    this.deliveredTotal += count;
    this.unified.recordOutbox('notification', 'succeeded', count);
  }

  recordFailed(count = 1): void {
    this.failedTotal += count;
    this.unified.recordOutbox('notification', 'failed', count);
  }

  recordRetry(count = 1): void {
    this.retryTotal += count;
    this.unified.recordOutbox('notification', 'retried', count);
  }

  recordDeadLetter(count = 1): void {
    this.deadLetterTotal += count;
    this.unified.recordOutbox('notification', 'dead_letter', count);
  }

  recordWorkerOutcome(outcome: 'completed' | 'failed' | 'retried' | 'skipped', count = 1): void {
    this.unified.recordWorker('notification', outcome, count);
  }

  getMetrics(): NotificationMetricsSnapshot {
    return {
      persistedTotal: this.persistedTotal,
      dispatchedTotal: this.dispatchedTotal,
      deliveredTotal: this.deliveredTotal,
      failedTotal: this.failedTotal,
      retryTotal: this.retryTotal,
      deadLetterTotal: this.deadLetterTotal,
    };
  }

  getUnifiedSnapshot(): Readonly<Record<string, number>> {
    return this.unified.snapshot();
  }

  resetMetrics(): void {
    this.persistedTotal = 0;
    this.dispatchedTotal = 0;
    this.deliveredTotal = 0;
    this.failedTotal = 0;
    this.retryTotal = 0;
    this.deadLetterTotal = 0;
  }
}

export const globalNotificationMetrics = new NotificationMetricsService(
  globalUnifiedOperationMetrics,
);
